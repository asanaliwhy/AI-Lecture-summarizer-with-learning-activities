package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubSummaryRepoForChat struct {
	summary *models.Summary
	err     error
}

func (s *stubSummaryRepoForChat) Create(ctx context.Context, summary *models.Summary) error {
	return nil
}
func (s *stubSummaryRepoForChat) ListByUser(ctx context.Context, userID uuid.UUID, search, sortBy string, limit, offset int) ([]*models.Summary, int, error) {
	return nil, 0, nil
}
func (s *stubSummaryRepoForChat) GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.summary, nil
}
func (s *stubSummaryRepoForChat) Update(ctx context.Context, summary *models.Summary) error { return nil }
func (s *stubSummaryRepoForChat) UpdateTitle(ctx context.Context, id uuid.UUID, title string) error {
	return nil
}
func (s *stubSummaryRepoForChat) Delete(ctx context.Context, id uuid.UUID) error { return nil }
func (s *stubSummaryRepoForChat) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return nil
}

type stubChatService struct {
	reply         string
	err           error
	capturedMsg   string
	capturedHist  []models.ChatMessage
	capturedCtx   string
	invocationCnt int
}

func (s *stubChatService) ChatWithSummary(ctx context.Context, summaryContent, userMessage string, history []models.ChatMessage) (string, error) {
	s.invocationCnt++
	s.capturedCtx = summaryContent
	s.capturedMsg = userMessage
	s.capturedHist = append([]models.ChatMessage(nil), history...)
	if s.err != nil {
		return "", s.err
	}
	if s.reply == "" {
		return "ok", nil
	}
	return s.reply, nil
}

func makeChatReq(t *testing.T, userID, summaryID uuid.UUID, body string) *http.Request {
	t.Helper()
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())

	req := httptest.NewRequest(http.MethodPost, "/api/v1/summaries/"+summaryID.String()+"/chat", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	return req
}

func TestAskQuestion_EmptyMessage_Returns400(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "raw"

	h := &ChatHandler{
		summaryRepo: &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		geminiService: &stubChatService{},
	}

	req := makeChatReq(t, userID, summaryID, `{"message":"   ","history":[]}`)
	rr := httptest.NewRecorder()
	h.AskQuestion(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestAskQuestion_MessageTooLong_Returns400(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "raw"
	longMsg := strings.Repeat("a", maxChatMessageLength+1)

	h := &ChatHandler{
		summaryRepo: &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		geminiService: &stubChatService{},
	}

	req := makeChatReq(t, userID, summaryID, `{"message":"`+longMsg+`","history":[]}`)
	rr := httptest.NewRecorder()
	h.AskQuestion(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestAskQuestion_HistoryTrimmed_OnlyLastNSent(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "summary content"
	chatSvc := &stubChatService{reply: "ok"}

	history := make([]models.ChatMessage, 0, 30)
	for i := 0; i < 30; i++ {
		role := "user"
		if i%2 == 1 {
			role = "assistant"
		}
		history = append(history, models.ChatMessage{Role: role, Content: "msg" + strings.Repeat("x", i)})
	}
	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"message": "question?",
		"history": history,
	})

	handler := &ChatHandler{
		summaryRepo:   &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		geminiService: chatSvc,
	}

	req := makeChatReq(t, userID, summaryID, string(bodyBytes))
	rr := httptest.NewRecorder()
	handler.AskQuestion(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}
	if len(chatSvc.capturedHist) != maxChatHistoryItems {
		t.Fatalf("expected trimmed history size %d, got %d", maxChatHistoryItems, len(chatSvc.capturedHist))
	}
	if chatSvc.capturedHist[0].Content != history[len(history)-maxChatHistoryItems].Content {
		t.Fatalf("expected oldest kept item to be the most recent-window first entry")
	}
}

func TestAskQuestion_BodyTooLarge_Returns400(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "raw"

	h := &ChatHandler{
		summaryRepo:   &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		geminiService: &stubChatService{},
	}

	tooLarge := strings.Repeat("x", maxChatBodyBytes+1024)
	req := makeChatReq(t, userID, summaryID, tooLarge)
	rr := httptest.NewRecorder()
	h.AskQuestion(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
}
