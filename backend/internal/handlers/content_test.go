package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubContentRepoForContentHandler struct {
	created []*models.Content
}

func (s *stubContentRepoForContentHandler) Create(ctx context.Context, c *models.Content) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	s.created = append(s.created, c)
	return nil
}

func (s *stubContentRepoForContentHandler) GetByID(ctx context.Context, id uuid.UUID) (*models.Content, error) {
	return nil, nil
}

type stubJobRepoForContentHandler struct {
	createdJobs      []*models.Job
	updatedStatuses  []string
	updatedStatusIDs []uuid.UUID
}

func (s *stubJobRepoForContentHandler) Create(ctx context.Context, j *models.Job) error {
	if j.ID == uuid.Nil {
		j.ID = uuid.New()
	}
	j.Status = "pending"
	s.createdJobs = append(s.createdJobs, j)
	return nil
}

func (s *stubJobRepoForContentHandler) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	s.updatedStatusIDs = append(s.updatedStatusIDs, id)
	s.updatedStatuses = append(s.updatedStatuses, status)
	return nil
}

func TestValidateYouTube_QueueFailure_MarksJobFailed(t *testing.T) {
	contentRepo := &stubContentRepoForContentHandler{}
	jobRepo := &stubJobRepoForContentHandler{}
	redisClient := redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})
	defer redisClient.Close()

	h := &ContentHandler{contentRepo: contentRepo, jobRepo: jobRepo, redis: redisClient}

	body := `{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/content/validate-youtube", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, uuid.New()))
	res := httptest.NewRecorder()

	h.ValidateYouTube(res, req)

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, res.Code)
	}

	if len(jobRepo.updatedStatuses) == 0 || jobRepo.updatedStatuses[len(jobRepo.updatedStatuses)-1] != "failed" {
		t.Fatalf("expected job status to be marked failed on queue error")
	}

	var payload map[string]any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	errObj := payload["error"].(map[string]any)
	if errObj["code"] != "QUEUE_ERROR" {
		t.Fatalf("expected QUEUE_ERROR, got %v", errObj["code"])
	}
}

func TestValidateYouTube_ReturnsQuicklyWithoutUpstreamDependency(t *testing.T) {
	contentRepo := &stubContentRepoForContentHandler{}
	jobRepo := &stubJobRepoForContentHandler{}
	h := &ContentHandler{contentRepo: contentRepo, jobRepo: jobRepo, redis: nil}

	body := `{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/content/validate-youtube", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, uuid.New()))
	res := httptest.NewRecorder()

	started := time.Now()
	h.ValidateYouTube(res, req)
	if time.Since(started) > time.Second {
		t.Fatalf("expected ValidateYouTube to return quickly without upstream requests")
	}

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, res.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	errObj := payload["error"].(map[string]any)
	if errObj["code"] != "QUEUE_ERROR" {
		t.Fatalf("expected UPSTREAM_ERROR, got %v", errObj["code"])
	}

	if len(contentRepo.created) != 1 {
		t.Fatalf("expected content to be created before queue failure, got %d", len(contentRepo.created))
	}

	metadata := contentRepo.created[0].MetadataJSON
	if !strings.Contains(string(metadata), "img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg") {
		t.Fatalf("expected static thumbnail metadata, got %s", string(metadata))
	}
}

func TestUpload_QueueFailure_MarksJobFailed(t *testing.T) {
	contentRepo := &stubContentRepoForContentHandler{}
	jobRepo := &stubJobRepoForContentHandler{}
	redisClient := redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})
	defer redisClient.Close()

	h := &ContentHandler{contentRepo: contentRepo, jobRepo: jobRepo, redis: redisClient, storagePath: t.TempDir()}

	data := "--boundary\r\n" +
		"Content-Disposition: form-data; name=\"file\"; filename=\"note.txt\"\r\n" +
		"Content-Type: text/plain\r\n\r\n" +
		"hello world\r\n" +
		"--boundary--\r\n"
	req := httptest.NewRequest(http.MethodPost, "/api/v1/content/upload", strings.NewReader(data))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=boundary")
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, uuid.New()))
	res := httptest.NewRecorder()

	h.Upload(res, req)

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, res.Code)
	}

	if len(jobRepo.updatedStatuses) == 0 || jobRepo.updatedStatuses[len(jobRepo.updatedStatuses)-1] != "failed" {
		t.Fatalf("expected job status to be marked failed on queue error")
	}

	var payload map[string]any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	errObj := payload["error"].(map[string]any)
	if errObj["code"] != "QUEUE_ERROR" {
		t.Fatalf("expected QUEUE_ERROR, got %v", errObj["code"])
	}
}

