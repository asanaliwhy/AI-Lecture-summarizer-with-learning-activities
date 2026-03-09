package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"lectura-backend/internal/models"
)

type stubAuthServiceForCookies struct {
	loginTokens         *models.AuthTokens
	refreshTokens       *models.AuthTokens
	lastRefreshTokenArg string
	lastLogoutTokenArg  string
}

func (s *stubAuthServiceForCookies) Register(ctx context.Context, req models.RegisterRequest) (*models.User, string, error) {
	return &models.User{}, "", nil
}

func (s *stubAuthServiceForCookies) VerifyEmail(ctx context.Context, token string) (*models.AuthTokens, error) {
	return &models.AuthTokens{}, nil
}

func (s *stubAuthServiceForCookies) Login(ctx context.Context, req models.LoginRequest) (*models.AuthTokens, error) {
	if s.loginTokens != nil {
		return s.loginTokens, nil
	}
	return &models.AuthTokens{AccessToken: "access", RefreshToken: "refresh", ExpiresIn: 900}, nil
}

func (s *stubAuthServiceForCookies) RefreshToken(ctx context.Context, refreshToken string) (*models.AuthTokens, error) {
	s.lastRefreshTokenArg = refreshToken
	if s.refreshTokens != nil {
		return s.refreshTokens, nil
	}
	return &models.AuthTokens{AccessToken: "new-access", RefreshToken: "new-refresh", ExpiresIn: 900}, nil
}

func (s *stubAuthServiceForCookies) Logout(ctx context.Context, refreshToken string) error {
	s.lastLogoutTokenArg = refreshToken
	return nil
}

func (s *stubAuthServiceForCookies) GoogleLogin(ctx context.Context, idToken string) (*models.AuthTokens, error) {
	return &models.AuthTokens{}, nil
}

func (s *stubAuthServiceForCookies) GoogleCodeLogin(ctx context.Context, code string) (*models.AuthTokens, error) {
	return &models.AuthTokens{}, nil
}

func (s *stubAuthServiceForCookies) GoogleOAuthConfig() (clientID string, redirectURI string, configured bool) {
	return "", "", false
}

func (s *stubAuthServiceForCookies) ResendVerification(ctx context.Context, email string) error {
	return nil
}

func TestLogin_SetsRefreshTokenHttpOnlyCookie(t *testing.T) {
	h := &AuthHandler{
		authService: &stubAuthServiceForCookies{
			loginTokens: &models.AuthTokens{AccessToken: "at-123", RefreshToken: "rt-456", ExpiresIn: 900},
		},
		isProduction: true,
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{"email":"user@example.com","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Login(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}

	res := rr.Result()
	defer res.Body.Close()

	if len(res.Cookies()) == 0 {
		t.Fatalf("expected Set-Cookie header")
	}

	var refreshCookie *http.Cookie
	for _, c := range res.Cookies() {
		if c.Name == refreshTokenCookieName {
			refreshCookie = c
			break
		}
	}

	if refreshCookie == nil {
		t.Fatalf("expected refresh_token cookie")
	}
	if !refreshCookie.HttpOnly {
		t.Fatalf("expected HttpOnly refresh cookie")
	}
	if !refreshCookie.Secure {
		t.Fatalf("expected Secure refresh cookie in production")
	}
	if refreshCookie.Path != refreshTokenCookiePath {
		t.Fatalf("expected cookie path %q, got %q", refreshTokenCookiePath, refreshCookie.Path)
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if _, hasRefresh := payload["refresh_token"]; hasRefresh {
		t.Fatalf("refresh_token must not be present in response body")
	}
}

func TestRefresh_ReadsTokenFromCookie(t *testing.T) {
	stub := &stubAuthServiceForCookies{
		refreshTokens: &models.AuthTokens{AccessToken: "new-at", RefreshToken: "new-rt", ExpiresIn: 900},
	}
	h := &AuthHandler{authService: stub}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", strings.NewReader(`{}`))
	req.AddCookie(&http.Cookie{Name: refreshTokenCookieName, Value: "cookie-refresh-token", Path: refreshTokenCookiePath})
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Refresh(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}
	if stub.lastRefreshTokenArg != "cookie-refresh-token" {
		t.Fatalf("expected refresh token from cookie, got %q", stub.lastRefreshTokenArg)
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload["access_token"] != "new-at" {
		t.Fatalf("expected access_token in response")
	}
	if _, hasRefresh := payload["refresh_token"]; hasRefresh {
		t.Fatalf("refresh_token must not be present in refresh response body")
	}
}
