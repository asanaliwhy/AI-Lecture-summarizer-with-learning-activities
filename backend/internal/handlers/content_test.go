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
	"lectura-backend/internal/services"
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
	originalYouTubeClient := services.YouTubeHTTPClient
	t.Cleanup(func() { services.YouTubeHTTPClient = originalYouTubeClient })

	services.YouTubeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body := `{"title":"Video","author_name":"Channel","thumbnail_url":"https://img.youtube.com/test.jpg"}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       ioNopCloser(strings.NewReader(body)),
		}, nil
	})}

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

func TestValidateYouTube_UpstreamTimeout_Returns502(t *testing.T) {
	originalYouTubeClient := services.YouTubeHTTPClient
	t.Cleanup(func() { services.YouTubeHTTPClient = originalYouTubeClient })

	services.YouTubeHTTPClient = &http.Client{
		Timeout: 25 * time.Millisecond,
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			<-req.Context().Done()
			return nil, req.Context().Err()
		}),
	}

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
		t.Fatalf("expected ValidateYouTube to return quickly on upstream timeout")
	}

	if res.Code != http.StatusBadGateway {
		t.Fatalf("expected status %d, got %d", http.StatusBadGateway, res.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	errObj := payload["error"].(map[string]any)
	if errObj["code"] != "UPSTREAM_ERROR" {
		t.Fatalf("expected UPSTREAM_ERROR, got %v", errObj["code"])
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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

type readCloser struct{ *strings.Reader }

func (r readCloser) Close() error { return nil }

func ioNopCloser(r *strings.Reader) readCloser { return readCloser{Reader: r} }
