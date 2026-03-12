package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubChatHistoryRepo struct {
	items        []models.ChatHistoryMessage
	getErr        error
	createErr     error
	deleteErr     error
	createdRole   string
	createdBody   string
	createdUserID uuid.UUID
}

func (s *stubChatHistoryRepo) GetBySummaryAndUser(ctx context.Context, summaryID, userID uuid.UUID) ([]models.ChatHistoryMessage, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return append([]models.ChatHistoryMessage(nil), s.items...), nil
}

func (s *stubChatHistoryRepo) Create(ctx context.Context, summaryID, userID uuid.UUID, role, content string) (*models.ChatHistoryMessage, error) {
	if s.createErr != nil {
		return nil, s.createErr
	}
	s.createdRole = role
	s.createdBody = content
	s.createdUserID = userID
	msg := &models.ChatHistoryMessage{
		ID:        uuid.New(),
		SummaryID: summaryID,
		UserID:    userID,
		Role:      role,
		Content:   content,
		CreatedAt: time.Now().UTC(),
	}
	return msg, nil
}

func (s *stubChatHistoryRepo) DeleteBySummaryAndUser(ctx context.Context, summaryID, userID uuid.UUID) error {
	if s.deleteErr != nil {
		return s.deleteErr
	}
	return nil
}

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

func makeChatReqWithMethod(t *testing.T, method string, userID, summaryID uuid.UUID, body string) *http.Request {
	t.Helper()
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())

	req := httptest.NewRequest(method, "/api/v1/summaries/"+summaryID.String()+"/chat-history", strings.NewReader(body))
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

func TestGetChatHistory_ReturnsOrderedMessages(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "summary"
	now := time.Now().UTC()

	h := &ChatHandler{
		summaryRepo: &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		chatRepo: &stubChatHistoryRepo{items: []models.ChatHistoryMessage{
			{ID: uuid.New(), SummaryID: summaryID, UserID: userID, Role: "user", Content: "hello", CreatedAt: now},
			{ID: uuid.New(), SummaryID: summaryID, UserID: userID, Role: "assistant", Content: "hi", CreatedAt: now.Add(time.Second)},
		}},
	}

	req := makeChatReqWithMethod(t, http.MethodGet, userID, summaryID, "")
	rr := httptest.NewRecorder()
	h.GetChatHistory(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}

	var out []models.ChatHistoryMessage
	if err := json.NewDecoder(rr.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(out))
	}
	if out[0].Role != "user" || out[1].Role != "assistant" {
		t.Fatalf("unexpected roles order: %+v", out)
	}
}

func TestCreateChatHistory_ValidPayload_Returns201(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "summary"
	historyRepo := &stubChatHistoryRepo{}

	h := &ChatHandler{
		summaryRepo: &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		chatRepo:    historyRepo,
	}

	req := makeChatReqWithMethod(t, http.MethodPost, userID, summaryID, `{"role":"user","content":"question"}`)
	rr := httptest.NewRecorder()
	h.CreateChatHistory(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected %d, got %d", http.StatusCreated, rr.Code)
	}
	if historyRepo.createdRole != "user" || historyRepo.createdBody != "question" {
		t.Fatalf("unexpected persisted values role=%q body=%q", historyRepo.createdRole, historyRepo.createdBody)
	}
}

func TestCreateChatHistory_InvalidRole_Returns400(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "summary"

	h := &ChatHandler{
		summaryRepo: &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		chatRepo:    &stubChatHistoryRepo{},
	}

	req := makeChatReqWithMethod(t, http.MethodPost, userID, summaryID, `{"role":"system","content":"x"}`)
	rr := httptest.NewRecorder()
	h.CreateChatHistory(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestClearChatHistory_Returns200(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	raw := "summary"

	h := &ChatHandler{
		summaryRepo: &stubSummaryRepoForChat{summary: &models.Summary{ID: summaryID, UserID: userID, ContentRaw: &raw}},
		chatRepo:    &stubChatHistoryRepo{},
	}

	req := makeChatReqWithMethod(t, http.MethodDelete, userID, summaryID, "")
	rr := httptest.NewRecorder()
	h.ClearChatHistory(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}
}
