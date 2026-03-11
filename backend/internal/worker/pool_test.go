package worker

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"lectura-backend/internal/models"
)

type stubWorkerJobRepo struct {
	job *models.Job
}

func (s *stubWorkerJobRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Job, error) {
	if s.job == nil {
		return &models.Job{ID: id, Status: "pending"}, nil
	}
	return s.job, nil
}

func (s *stubWorkerJobRepo) Create(ctx context.Context, j *models.Job) error { return nil }
func (s *stubWorkerJobRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	return nil
}
func (s *stubWorkerJobRepo) UpdateStatusIfNotTerminal(ctx context.Context, id uuid.UUID, status string) (bool, error) {
	return true, nil
}
func (s *stubWorkerJobRepo) UpdateError(ctx context.Context, id uuid.UUID, errMsg string, retryCount int) error {
	return nil
}

func TestProcessQuiz_MalformedConfig_ReturnsError(t *testing.T) {
	p := &Pool{jobRepo: &stubWorkerJobRepo{job: &models.Job{Status: "pending"}}}
	jobID := uuid.New()
	job := &models.Job{ID: jobID, ConfigJSON: []byte("not json")}

	err := p.processQuiz(context.Background(), job)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), jobID.String()) {
		t.Fatalf("expected error to contain job id %s, got %v", jobID, err)
	}
}

func TestProcessQuiz_ZeroQuestions_ReturnsError(t *testing.T) {
	p := &Pool{jobRepo: &stubWorkerJobRepo{job: &models.Job{Status: "pending"}}}
	jobID := uuid.New()
	job := &models.Job{ID: jobID, ConfigJSON: []byte(`{"summary_id":"` + uuid.New().String() + `","num_questions":0}`)}

	err := p.processQuiz(context.Background(), job)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "num_questions") {
		t.Fatalf("expected num_questions validation error, got %v", err)
	}
}

func TestProcessFlashcard_MalformedConfig_ReturnsError(t *testing.T) {
	p := &Pool{jobRepo: &stubWorkerJobRepo{job: &models.Job{Status: "pending"}}}
	jobID := uuid.New()
	job := &models.Job{ID: jobID, ConfigJSON: []byte("not json")}

	err := p.processFlashcard(context.Background(), job)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), jobID.String()) {
		t.Fatalf("expected error to contain job id %s, got %v", jobID, err)
	}
}

func TestProcessFlashcard_ZeroCards_ReturnsError(t *testing.T) {
	p := &Pool{jobRepo: &stubWorkerJobRepo{job: &models.Job{Status: "pending"}}}
	jobID := uuid.New()
	job := &models.Job{ID: jobID, ConfigJSON: []byte(`{"summary_id":"` + uuid.New().String() + `","num_cards":0}`)}

	err := p.processFlashcard(context.Background(), job)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "num_cards") {
		t.Fatalf("expected num_cards validation error, got %v", err)
	}
}

