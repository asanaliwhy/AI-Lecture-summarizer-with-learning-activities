package services

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/stripe/stripe-go/v78"
	portalsession "github.com/stripe/stripe-go/v78/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v78/checkout/session"
	"github.com/stripe/stripe-go/v78/webhook"
)

type StripeService struct {
	webhookSecret string
}

func NewStripeService() *StripeService {
	stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
	return &StripeService{
		webhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
	}
}

func (s *StripeService) CreateCheckoutSession(ctx context.Context, userID, userEmail, plan, successURL, cancelURL string) (string, error) {
	// Map our internal plans to Stripe Price IDs (these should be in env vars in production)
	// For this diploma project, we can use env vars or hardcode for testing.
	priceID := os.Getenv("STRIPE_PRICE_ID_" + strings.ToUpper(plan)) // e.g., STRIPE_PRICE_ID_PRO
	if priceID == "" {
		return "", fmt.Errorf("invalid plan or missing price ID for plan: %s", plan)
	}

	params := &stripe.CheckoutSessionParams{
		PaymentMethodTypes: stripe.StringSlice([]string{"card"}),
		Mode:               stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL:    stripe.String(successURL),
		CancelURL:     stripe.String(cancelURL),
		CustomerEmail: stripe.String(userEmail),
		ClientReferenceID: stripe.String(userID),
	}

	// Add metadata to know which user this is for in the webhook
	params.AddMetadata("user_id", userID)
	params.AddMetadata("plan", plan)

	sess, err := checkoutsession.New(params)
	if err != nil {
		return "", err
	}

	return sess.URL, nil
}

func (s *StripeService) CreateBillingPortalSession(ctx context.Context, customerID, returnURL string) (string, error) {
	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID),
		ReturnURL: stripe.String(returnURL),
	}

	sess, err := portalsession.New(params)
	if err != nil {
		return "", err
	}

	return sess.URL, nil
}

func (s *StripeService) ConstructWebhookEvent(payload []byte, signature string) (stripe.Event, error) {
	return webhook.ConstructEvent(payload, signature, s.webhookSecret)
}
