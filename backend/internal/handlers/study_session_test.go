package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubStudySessionRepo struct {
	startErr error

	heartbeatUpdated bool
	heartbeatErr     error
	heartbeatCalls   int
	heartbeatUserID  uuid.UUID
	heartbeatID      uuid.UUID

	stopUpdated bool
	stopErr     error
	stopCalls   int
	stopUserID  uuid.UUID
	stopID      uuid.UUID
}

func (s *stubStudySessionRepo) Start(ctx context.Context, session *models.StudySession) error {
	if s.startErr != nil {
		return s.startErr
	}
	if session.ID == uuid.Nil {
		session.ID = uuid.New()
	}
	return nil
}

func (s *stubStudySessionRepo) Heartbeat(ctx context.Context, sessionID, userID uuid.UUID) (bool, error) {
	s.heartbeatCalls++
	s.heartbeatID = sessionID
	s.heartbeatUserID = userID
	if s.heartbeatErr != nil {
		return false, s.heartbeatErr
	}
	return s.heartbeatUpdated, nil
}

func (s *stubStudySessionRepo) Stop(ctx context.Context, sessionID, userID uuid.UUID) (bool, error) {
	s.stopCalls++
	s.stopID = sessionID
	s.stopUserID = userID
	if s.stopErr != nil {
		return false, s.stopErr
	}
	return s.stopUpdated, nil
}

func makeStudySessionReq(t *testing.T, method, path string, userID uuid.UUID, sessionID *uuid.UUID, body string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))

	if sessionID != nil {
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", sessionID.String())
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	}

	return req
}

func TestHeartbeat_ValidSession_Returns200(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	repo := &stubStudySessionRepo{heartbeatUpdated: true}
	h := &StudySessionHandler{repo: repo}

	req := makeStudySessionReq(t, http.MethodPost, "/api/v1/study-sessions/"+sessionID.String()+"/heartbeat", userID, &sessionID, "{}")
	rr := httptest.NewRecorder()

	h.Heartbeat(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}
	if repo.heartbeatCalls != 1 || repo.heartbeatID != sessionID || repo.heartbeatUserID != userID {
		t.Fatalf("unexpected heartbeat call args")
	}
}

func TestHeartbeat_NonExistentSession_Returns404(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	repo := &stubStudySessionRepo{heartbeatUpdated: false}
	h := &StudySessionHandler{repo: repo}

	req := makeStudySessionReq(t, http.MethodPost, "/api/v1/study-sessions/"+sessionID.String()+"/heartbeat", userID, &sessionID, "{}")
	rr := httptest.NewRecorder()

	h.Heartbeat(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestHeartbeat_AlreadyEndedSession_Returns404(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	repo := &stubStudySessionRepo{heartbeatUpdated: false}
	h := &StudySessionHandler{repo: repo}

	req := makeStudySessionReq(t, http.MethodPost, "/api/v1/study-sessions/"+sessionID.String()+"/heartbeat", userID, &sessionID, "{}")
	rr := httptest.NewRecorder()

	h.Heartbeat(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestHeartbeat_ForeignSession_Returns404(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	repo := &stubStudySessionRepo{heartbeatUpdated: false}
	h := &StudySessionHandler{repo: repo}

	req := makeStudySessionReq(t, http.MethodPost, "/api/v1/study-sessions/"+sessionID.String()+"/heartbeat", ownerID, &sessionID, "{}")
	rr := httptest.NewRecorder()

	h.Heartbeat(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestStop_ValidSession_Returns200(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	repo := &stubStudySessionRepo{stopUpdated: true}
	h := &StudySessionHandler{repo: repo}

	req := makeStudySessionReq(t, http.MethodPost, "/api/v1/study-sessions/"+sessionID.String()+"/stop", userID, &sessionID, "{}")
	rr := httptest.NewRecorder()

	h.Stop(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}
	if repo.stopCalls != 1 || repo.stopID != sessionID || repo.stopUserID != userID {
		t.Fatalf("unexpected stop call args")
	}
}

func TestStop_AlreadyEndedSession_Returns404(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	repo := &stubStudySessionRepo{stopUpdated: false}
	h := &StudySessionHandler{repo: repo}

	req := makeStudySessionReq(t, http.MethodPost, "/api/v1/study-sessions/"+sessionID.String()+"/stop", userID, &sessionID, "{}")
	rr := httptest.NewRecorder()

	h.Stop(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestStop_ForeignSession_Returns404(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	repo := &stubStudySessionRepo{stopUpdated: false}
	h := &StudySessionHandler{repo: repo}

	req := makeStudySessionReq(t, http.MethodPost, "/api/v1/study-sessions/"+sessionID.String()+"/stop", userID, &sessionID, "{}")
	rr := httptest.NewRecorder()

	h.Stop(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, rr.Code)
	}
}
