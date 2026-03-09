package services

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"lectura-backend/internal/models"
)

type stubVerificationEmailSender struct {
	called chan string
}

func (s *stubVerificationEmailSender) SendVerificationEmail(to, token string) error {
	if s.called != nil {
		s.called <- to
	}
	return nil
}

type stubAuthUserRepo struct {
	usersByEmail      map[string]*models.User
	createdUsers      []*models.User
	lastGetByEmailArg string
}

func (s *stubAuthUserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	s.lastGetByEmailArg = email
	if u, ok := s.usersByEmail[email]; ok {
		return u, nil
	}
	return nil, pgx.ErrNoRows
}

func (s *stubAuthUserRepo) Create(ctx context.Context, user *models.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	s.createdUsers = append(s.createdUsers, user)
	if s.usersByEmail == nil {
		s.usersByEmail = map[string]*models.User{}
	}
	s.usersByEmail[user.Email] = user
	return nil
}

func (s *stubAuthUserRepo) CreateSettings(ctx context.Context, userID uuid.UUID) error {
	return nil
}

func (s *stubAuthUserRepo) VerifyEmail(ctx context.Context, userID uuid.UUID) error {
	return nil
}

func (s *stubAuthUserRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	for _, u := range s.createdUsers {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, pgx.ErrNoRows
}

func (s *stubAuthUserRepo) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	return nil
}

func (s *stubAuthUserRepo) GetByGoogleID(ctx context.Context, googleID string) (*models.User, error) {
	return nil, pgx.ErrNoRows
}

func (s *stubAuthUserRepo) LinkGoogle(ctx context.Context, userID uuid.UUID, googleID string) error {
	return nil
}

func TestRegister_MixedCaseEmail_StoredAsLowercase(t *testing.T) {
	repo := &stubAuthUserRepo{usersByEmail: map[string]*models.User{}}
	svc := &AuthService{userRepo: repo, redis: redis.NewClient(&redis.Options{
		Addr:         "127.0.0.1:0",
		DialTimeout:  10 * time.Millisecond,
		ReadTimeout:  10 * time.Millisecond,
		WriteTimeout: 10 * time.Millisecond,
	})}

	_, _, err := svc.Register(context.Background(), models.RegisterRequest{
		FullName: "Ada Lovelace",
		Email:    "Ada@Example.com ",
		Password: "StrongPass123",
	})
	if err == nil {
		t.Fatalf("expected redis/email dependencies error after create path, got nil")
	}
	if len(repo.createdUsers) != 1 {
		t.Fatalf("expected one created user, got %d", len(repo.createdUsers))
	}
	if repo.createdUsers[0].Email != "ada@example.com" {
		t.Fatalf("expected lowercase email, got %q", repo.createdUsers[0].Email)
	}
}

func TestLogin_MixedCaseEmail_SucceedsLookupWithNormalizedEmail(t *testing.T) {
	hashBytes, err := bcrypt.GenerateFromPassword([]byte("StrongPass123"), 12)
	if err != nil {
		t.Fatalf("failed to generate bcrypt hash: %v", err)
	}
	hash := string(hashBytes)
	repo := &stubAuthUserRepo{usersByEmail: map[string]*models.User{
		"ada@example.com": {
			ID:           uuid.New(),
			Email:        "ada@example.com",
			PasswordHash: hash,
			IsVerified:   true,
			IsActive:     true,
			Plan:         "free",
		},
	}}

	svc := &AuthService{
		userRepo: repo,
		issueTokensFn: func(ctx context.Context, user *models.User) (*models.AuthTokens, error) {
			return &models.AuthTokens{AccessToken: "a", RefreshToken: "r", ExpiresIn: 900}, nil
		},
	}

	_, err = svc.Login(context.Background(), models.LoginRequest{
		Email:    "Ada@Example.com",
		Password: "StrongPass123",
	})
	if err != nil {
		t.Fatalf("expected login success, got error: %v", err)
	}
	if repo.lastGetByEmailArg != "ada@example.com" {
		t.Fatalf("expected normalized lookup email, got %q", repo.lastGetByEmailArg)
	}
}

func TestResendVerification_UnknownEmail_ReturnsNilAndDoesNotSend(t *testing.T) {
	repo := &stubAuthUserRepo{usersByEmail: map[string]*models.User{}}
	emailSender := &stubVerificationEmailSender{called: make(chan string, 1)}
	svc := &AuthService{
		userRepo: repo,
		redis: redis.NewClient(&redis.Options{
			Addr:         "127.0.0.1:0",
			DialTimeout:  10 * time.Millisecond,
			ReadTimeout:  10 * time.Millisecond,
			WriteTimeout: 10 * time.Millisecond,
		}),
		email: emailSender,
	}

	err := svc.ResendVerification(context.Background(), "Unknown@Example.com")
	if err != nil {
		t.Fatalf("expected nil error for unknown email, got %v", err)
	}

	select {
	case <-emailSender.called:
		t.Fatalf("did not expect verification email to be sent for unknown email")
	default:
	}
}

func TestResendVerification_KnownUnverifiedEmail_ReturnsNilAndSends(t *testing.T) {
	user := &models.User{
		ID:         uuid.New(),
		Email:      "ada@example.com",
		IsVerified: false,
	}
	repo := &stubAuthUserRepo{usersByEmail: map[string]*models.User{"ada@example.com": user}}
	emailSender := &stubVerificationEmailSender{called: make(chan string, 1)}
	svc := &AuthService{
		userRepo: repo,
		redis: redis.NewClient(&redis.Options{
			Addr:         "127.0.0.1:0",
			DialTimeout:  10 * time.Millisecond,
			ReadTimeout:  10 * time.Millisecond,
			WriteTimeout: 10 * time.Millisecond,
		}),
		email: emailSender,
	}

	err := svc.ResendVerification(context.Background(), "Ada@Example.com")
	if err != nil {
		t.Fatalf("expected nil error for known unverified email, got %v", err)
	}

	select {
	case to := <-emailSender.called:
		if to != "ada@example.com" {
			t.Fatalf("expected send to normalized stored email, got %q", to)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("expected verification email to be sent")
	}
}

func TestGoogleCodeLogin_UpstreamTimeout_ReturnsError(t *testing.T) {
	originalClient := DefaultHTTPClient
	t.Cleanup(func() { DefaultHTTPClient = originalClient })

	DefaultHTTPClient = &http.Client{
		Timeout: 25 * time.Millisecond,
		Transport: roundTripFuncAuth(func(req *http.Request) (*http.Response, error) {
			<-req.Context().Done()
			return nil, req.Context().Err()
		}),
	}

	svc := &AuthService{
		googleClientID:     "client-id",
		googleClientSecret: "client-secret",
		googleRedirectURI:  "https://example.com/callback",
	}

	start := time.Now()
	_, err := svc.GoogleCodeLogin(context.Background(), "auth-code")
	if err == nil {
		t.Fatalf("expected timeout error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected context deadline exceeded wrapped error, got %v", err)
	}
	if time.Since(start) > time.Second {
		t.Fatalf("expected GoogleCodeLogin to return quickly on upstream timeout")
	}
}

type roundTripFuncAuth func(*http.Request) (*http.Response, error)

func (f roundTripFuncAuth) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }
