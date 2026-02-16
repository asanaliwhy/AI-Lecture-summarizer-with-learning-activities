package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type AuthService struct {
	userRepo       *repository.UserRepo
	redis          *redis.Client
	jwt            *middleware.JWTAuth
	email          *EmailService
	googleClientID string
}

func NewAuthService(userRepo *repository.UserRepo, redisClient *redis.Client, jwt *middleware.JWTAuth, email *EmailService, googleClientID string) *AuthService {
	return &AuthService{
		userRepo:       userRepo,
		redis:          redisClient,
		jwt:            jwt,
		email:          email,
		googleClientID: googleClientID,
	}
}

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

func (s *AuthService) Register(ctx context.Context, req models.RegisterRequest) (*models.User, string, error) {
	// Validate all fields at once
	fieldErrors := make(map[string]string)

	if req.FullName == "" {
		fieldErrors["full_name"] = "Full name is required"
	}
	if !emailRegex.MatchString(req.Email) {
		fieldErrors["email"] = "Invalid email format"
	}
	if err := validatePassword(req.Password); err != nil {
		fieldErrors["password"] = err.Error()
	}

	if len(fieldErrors) > 0 {
		return nil, "", &ValidationError{Fields: fieldErrors}
	}

	// Check uniqueness
	_, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err == nil {
		return nil, "", &ConflictError{Message: "Email already in use"}
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, "", err
	}

	// Hash password (bcrypt cost 12)
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return nil, "", fmt.Errorf("failed to hash password: %w", err)
	}

	user := &models.User{
		Email:        req.Email,
		PasswordHash: string(hash),
		FullName:     req.FullName,
		IsVerified:   false,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, "", err
	}

	// Create default settings
	s.userRepo.CreateSettings(ctx, user.ID)

	// Generate verification token
	token, err := generateToken(32)
	if err != nil {
		return nil, "", err
	}

	// Store in Redis with 24-hour TTL
	err = s.redis.Set(ctx, "email_verify:"+token, user.ID.String(), 24*time.Hour).Err()
	if err != nil {
		return nil, "", fmt.Errorf("failed to store verification token: %w", err)
	}

	// Send verification email
	go s.email.SendVerificationEmail(user.Email, token)

	return user, token, nil
}

func (s *AuthService) VerifyEmail(ctx context.Context, token string) (*models.AuthTokens, error) {
	// Look up token
	userIDStr, err := s.redis.Get(ctx, "email_verify:"+token).Result()
	if err != nil {
		return nil, &NotFoundError{Message: "Invalid or expired verification token"}
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in token: %w", err)
	}

	// Mark verified
	if err := s.userRepo.VerifyEmail(ctx, userID); err != nil {
		return nil, err
	}

	// Delete used token
	s.redis.Del(ctx, "email_verify:"+token)

	// Get user for token generation
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	return s.issueTokens(ctx, user)
}

func (s *AuthService) Login(ctx context.Context, req models.LoginRequest) (*models.AuthTokens, error) {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &UnauthorizedError{Message: "Invalid email or password"}
		}
		return nil, err
	}

	if !user.IsVerified {
		return nil, &ForbiddenError{Message: "Please verify your email before signing in."}
	}

	if !user.IsActive {
		return nil, &UnauthorizedError{Message: "Account is deactivated"}
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, &UnauthorizedError{Message: "Invalid email or password"}
	}

	s.userRepo.UpdateLastLogin(ctx, user.ID)

	return s.issueTokens(ctx, user)
}

func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (*models.AuthTokens, error) {
	// Look up refresh token
	userIDStr, err := s.redis.Get(ctx, "refresh:"+refreshToken).Result()
	if err != nil {
		return nil, &UnauthorizedError{Message: "Invalid or expired refresh token. Please log in again."}
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Delete old token (rotation)
	s.redis.Del(ctx, "refresh:"+refreshToken)

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if !user.IsActive {
		return nil, &UnauthorizedError{Message: "Account is deactivated"}
	}

	return s.issueTokens(ctx, user)
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	return s.redis.Del(ctx, "refresh:"+refreshToken).Err()
}

func (s *AuthService) ResendVerification(ctx context.Context, email string) (string, error) {
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return "", &NotFoundError{Message: "Email not found"}
	}

	if user.IsVerified {
		return "", &ConflictError{Message: "Email is already verified"}
	}

	// Rate limit check
	rateLimitKey := fmt.Sprintf("resend_limit:%s", user.ID.String())
	exists, _ := s.redis.Exists(ctx, rateLimitKey).Result()
	if exists > 0 {
		return "", &RateLimitError{Message: "Please wait 60 seconds before requesting another verification email"}
	}

	// Generate new token
	token, err := generateToken(32)
	if err != nil {
		return "", err
	}

	s.redis.Set(ctx, "email_verify:"+token, user.ID.String(), 24*time.Hour)
	s.redis.Set(ctx, rateLimitKey, "1", 60*time.Second)

	// Send verification email
	go s.email.SendVerificationEmail(user.Email, token)

	return token, nil
}

func (s *AuthService) issueTokens(ctx context.Context, user *models.User) (*models.AuthTokens, error) {
	accessToken, err := s.jwt.GenerateAccessToken(user.ID, user.Email, user.Plan)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err := generateToken(64)
	if err != nil {
		return nil, err
	}

	// Store refresh token in Redis (7 days)
	err = s.redis.Set(ctx, "refresh:"+refreshToken, user.ID.String(), 7*24*time.Hour).Err()
	if err != nil {
		return nil, fmt.Errorf("failed to store refresh token: %w", err)
	}

	return &models.AuthTokens{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900,
	}, nil
}

// GoogleLogin verifies a Google ID token and logs in or creates the user.
func (s *AuthService) GoogleLogin(ctx context.Context, idToken string) (*models.AuthTokens, error) {
	if s.googleClientID == "" {
		return nil, &ValidationError{Fields: map[string]string{"google": "Google sign-in is not configured"}}
	}

	// Verify the ID token using Google's tokeninfo endpoint
	resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken)
	if err != nil {
		return nil, fmt.Errorf("failed to verify Google token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, &UnauthorizedError{Message: "Invalid Google token"}
	}

	var tokenInfo struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		Aud           string `json:"aud"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenInfo); err != nil {
		return nil, fmt.Errorf("failed to decode Google token info: %w", err)
	}

	// Verify audience matches our client ID
	if tokenInfo.Aud != s.googleClientID {
		return nil, &UnauthorizedError{Message: "Google token audience mismatch"}
	}

	if tokenInfo.Email == "" || tokenInfo.Sub == "" {
		return nil, &ValidationError{Fields: map[string]string{"google": "Google account missing email"}}
	}

	// Try to find existing user by Google ID
	user, err := s.userRepo.GetByGoogleID(ctx, tokenInfo.Sub)
	if err == nil {
		// Existing Google user — update last login and issue tokens
		if !user.IsActive {
			return nil, &UnauthorizedError{Message: "Account is deactivated"}
		}
		s.userRepo.UpdateLastLogin(ctx, user.ID)
		return s.issueTokens(ctx, user)
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// Try to find existing user by email
	user, err = s.userRepo.GetByEmail(ctx, tokenInfo.Email)
	if err == nil {
		// Existing email user — link Google account
		if !user.IsActive {
			return nil, &UnauthorizedError{Message: "Account is deactivated"}
		}
		// Update the user to link their Google account
		s.userRepo.LinkGoogle(ctx, user.ID, tokenInfo.Sub)
		s.userRepo.UpdateLastLogin(ctx, user.ID)
		return s.issueTokens(ctx, user)
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// New user — create account
	googleID := tokenInfo.Sub
	var avatarURL *string
	if tokenInfo.Picture != "" {
		avatarURL = &tokenInfo.Picture
	}

	newUser := &models.User{
		Email:        tokenInfo.Email,
		FullName:     tokenInfo.Name,
		AvatarURL:    avatarURL,
		IsVerified:   true, // Google accounts are pre-verified
		AuthProvider: "google",
		GoogleID:     &googleID,
	}

	if err := s.userRepo.Create(ctx, newUser); err != nil {
		return nil, err
	}

	// Create default settings
	s.userRepo.CreateSettings(ctx, newUser.ID)

	return s.issueTokens(ctx, newUser)
}

func generateToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func validatePassword(pw string) error {
	if len(pw) < 8 {
		return fmt.Errorf("Password must be at least 8 characters")
	}
	hasNumber := false
	for _, ch := range pw {
		if unicode.IsDigit(ch) {
			hasNumber = true
			break
		}
	}
	if !hasNumber {
		return fmt.Errorf("Password must contain at least one number")
	}
	return nil
}

// Custom errors
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string { return "Validation error" }

type ConflictError struct{ Message string }

func (e *ConflictError) Error() string { return e.Message }

type NotFoundError struct{ Message string }

func (e *NotFoundError) Error() string { return e.Message }

type UnauthorizedError struct{ Message string }

func (e *UnauthorizedError) Error() string { return e.Message }

type ForbiddenError struct{ Message string }

func (e *ForbiddenError) Error() string { return e.Message }

type RateLimitError struct{ Message string }

func (e *RateLimitError) Error() string { return e.Message }
