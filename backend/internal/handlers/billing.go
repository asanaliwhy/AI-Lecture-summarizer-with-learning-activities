package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v78"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/repository"
	"lectura-backend/internal/services"
)

type BillingHandler struct {
	stripeService *services.StripeService
	userRepo      *repository.UserRepo
}

func NewBillingHandler(stripeService *services.StripeService, userRepo *repository.UserRepo) *BillingHandler {
	return &BillingHandler{
		stripeService: stripeService,
		userRepo:      userRepo,
	}
}

type CheckoutRequest struct {
	Plan string `json:"plan"`
}

func (h *BillingHandler) CreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Plan != "student" && req.Plan != "pro" {
		http.Error(w, "Invalid plan selected", http.StatusBadRequest)
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	successURL := frontendURL + "/settings?tab=billing&checkout=success"
	cancelURL := frontendURL + "/settings?tab=billing&checkout=cancel"

	url, err := h.stripeService.CreateCheckoutSession(r.Context(), user.ID.String(), user.Email, req.Plan, successURL, cancelURL)
	if err != nil {
		http.Error(w, "Failed to create checkout session", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"url": url})
}

func (h *BillingHandler) CreatePortalSession(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	if user.StripeCustomerID == nil || *user.StripeCustomerID == "" {
		http.Error(w, "No active subscription found", http.StatusBadRequest)
		return
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	returnURL := frontendURL + "/settings?tab=billing"

	url, err := h.stripeService.CreateBillingPortalSession(r.Context(), *user.StripeCustomerID, returnURL)
	if err != nil {
		http.Error(w, "Failed to create portal session", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"url": url})
}

func (h *BillingHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	const MaxBodyBytes = int64(65536)
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusServiceUnavailable)
		return
	}

	signature := r.Header.Get("Stripe-Signature")
	event, err := h.stripeService.ConstructWebhookEvent(payload, signature)
	if err != nil {
		log.Printf("Stripe Webhook Signature Error: %v", err)
		http.Error(w, "Invalid signature", http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	switch event.Type {
	case "checkout.session.completed":
		var session stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
			http.Error(w, "Error parsing webhook JSON", http.StatusBadRequest)
			return
		}

		userIDStr := session.Metadata["user_id"]
		plan := session.Metadata["plan"]
		if userIDStr == "" || plan == "" {
			w.WriteHeader(http.StatusOK)
			return
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			w.WriteHeader(http.StatusOK)
			return
		}

		user, err := h.userRepo.GetByID(ctx, userID)
		if err == nil {
			user.Plan = plan
			user.StripeCustomerID = &session.Customer.ID
			user.StripeSubscriptionID = &session.Subscription.ID
			h.userRepo.Update(ctx, user)
		}

	case "customer.subscription.deleted":
		var subscription stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &subscription); err != nil {
			http.Error(w, "Error parsing webhook JSON", http.StatusBadRequest)
			return
		}

		// Find user by StripeCustomerID and revert plan to 'free'
		// Note: Requires a repo method to find by StripeCustomerID, or we can just update directly.
		// Since we don't have GetByStripeCustomerID, let's execute a direct query.
		h.userRepo.UpdatePlanByStripeCustomerID(ctx, subscription.Customer.ID, "free")
	}

	w.WriteHeader(http.StatusOK)
}
