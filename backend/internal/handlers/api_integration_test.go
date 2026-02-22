package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func errorCodeFromBody(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()

	var payload map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	errObj, ok := payload["error"].(map[string]interface{})
	if !ok {
		t.Fatalf("response body missing error object: %#v", payload)
	}

	code, ok := errObj["code"].(string)
	if !ok {
		t.Fatalf("response error missing code: %#v", errObj)
	}

	return code
}

func TestAuthAPI_Register_InvalidJSON_ReturnsValidationError(t *testing.T) {
	h := &AuthHandler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewBufferString("{"))
	rr := httptest.NewRecorder()

	h.Register(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}

func TestAuthAPI_Login_InvalidJSON_ReturnsValidationError(t *testing.T) {
	h := &AuthHandler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString("{"))
	rr := httptest.NewRecorder()

	h.Login(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}

func TestAuthAPI_VerifyEmail_MissingToken_ReturnsValidationError(t *testing.T) {
	h := &AuthHandler{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/verify-email", nil)
	rr := httptest.NewRecorder()

	h.VerifyEmail(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}

func TestAuthAPI_GoogleLogin_MissingIDToken_ReturnsValidationError(t *testing.T) {
	h := &AuthHandler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/google", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.GoogleLogin(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}

func TestSummaryAPI_Generate_InvalidJSON_ReturnsValidationError(t *testing.T) {
	h := &SummaryHandler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/summaries/generate", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Generate(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}

func TestQuizAPI_Generate_InvalidJSON_ReturnsValidationError(t *testing.T) {
	h := &QuizHandler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/generate", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Generate(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}

func TestFlashcardAPI_Generate_ValidationGuards(t *testing.T) {
	h := &FlashcardHandler{}

	t.Run("missing summary_id", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/flashcards/generate", bytes.NewBufferString(`{"title":"Deck","num_cards":5,"strategy":"term_definition"}`))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		h.Generate(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
		}
		if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
			t.Fatalf("expected VALIDATION_ERROR, got %q", code)
		}
	})

	t.Run("invalid strategy", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"summary_id": uuid.New(),
			"title":      "Deck",
			"num_cards":  5,
			"strategy":   "unsupported",
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/flashcards/generate", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		h.Generate(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
		}
		if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
			t.Fatalf("expected VALIDATION_ERROR, got %q", code)
		}
	})
}
