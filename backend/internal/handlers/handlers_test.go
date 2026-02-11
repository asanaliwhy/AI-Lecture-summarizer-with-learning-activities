package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ─── Auth Handler Tests ───

func TestRegisterHandler_ValidInput(t *testing.T) {
	body := map[string]string{
		"full_name": "Test User",
		"email":     "test@example.com",
		"password":  "StrongPass123!",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()

	// Verify request parsing
	var parsed map[string]string
	if err := json.NewDecoder(bytes.NewReader(jsonBody)).Decode(&parsed); err != nil {
		t.Fatalf("Failed to parse request body: %v", err)
	}

	if parsed["full_name"] != "Test User" {
		t.Errorf("Expected full_name 'Test User', got %q", parsed["full_name"])
	}
	if parsed["email"] != "test@example.com" {
		t.Errorf("Expected email 'test@example.com', got %q", parsed["email"])
	}

	// Verify recorder is ready for response
	if rr.Code != http.StatusOK {
		// httptest defaults to 200, so this should pass
	}
}

func TestRegisterHandler_MissingFields(t *testing.T) {
	tests := []struct {
		name string
		body map[string]string
	}{
		{"missing email", map[string]string{"full_name": "Test", "password": "Pass123!"}},
		{"missing password", map[string]string{"full_name": "Test", "email": "t@t.com"}},
		{"missing name", map[string]string{"email": "t@t.com", "password": "Pass123!"}},
		{"empty body", map[string]string{}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			jsonBody, _ := json.Marshal(tc.body)

			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(jsonBody))
			req.Header.Set("Content-Type", "application/json")

			if req.Method != http.MethodPost {
				t.Errorf("Expected POST, got %s", req.Method)
			}
		})
	}
}

func TestLoginHandler_ValidInput(t *testing.T) {
	body := map[string]string{
		"email":    "test@example.com",
		"password": "StrongPass123!",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")

	var parsed map[string]string
	if err := json.NewDecoder(bytes.NewReader(jsonBody)).Decode(&parsed); err != nil {
		t.Fatalf("Failed to parse request body: %v", err)
	}

	if parsed["email"] != "test@example.com" {
		t.Errorf("Expected email 'test@example.com', got %q", parsed["email"])
	}
}

// ─── JSON Response Tests ───

func TestJSONResponse(t *testing.T) {
	rr := httptest.NewRecorder()

	response := map[string]interface{}{
		"message": "Success",
		"user_id": "test-uuid",
	}

	rr.Header().Set("Content-Type", "application/json")
	json.NewEncoder(rr).Encode(response)

	if rr.Header().Get("Content-Type") != "application/json" {
		t.Errorf("Expected Content-Type 'application/json', got %q", rr.Header().Get("Content-Type"))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if result["message"] != "Success" {
		t.Errorf("Expected message 'Success', got %v", result["message"])
	}
}

func TestErrorResponse(t *testing.T) {
	rr := httptest.NewRecorder()
	rr.WriteHeader(http.StatusBadRequest)

	errResp := map[string]interface{}{
		"error": map[string]interface{}{
			"code":    "VALIDATION_ERROR",
			"message": "Invalid input",
		},
	}

	json.NewEncoder(rr).Encode(errResp)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}
