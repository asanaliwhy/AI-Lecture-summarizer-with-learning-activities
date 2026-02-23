package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type SummaryHandler struct {
	summaryRepo summaryRepository
	contentRepo *repository.ContentRepo
	jobRepo     *repository.JobRepo
	redis       *redis.Client
}

type summaryRepository interface {
	Create(ctx context.Context, s *models.Summary) error
	ListByUser(ctx context.Context, userID uuid.UUID, search, sortBy string, limit, offset int) ([]*models.Summary, int, error)
	GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error)
	Update(ctx context.Context, s *models.Summary) error
	Delete(ctx context.Context, id uuid.UUID) error
	ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
}

func NewSummaryHandler(summaryRepo summaryRepository, contentRepo *repository.ContentRepo, jobRepo *repository.JobRepo, redisClient *redis.Client) *SummaryHandler {
	return &SummaryHandler{
		summaryRepo: summaryRepo,
		contentRepo: contentRepo,
		jobRepo:     jobRepo,
		redis:       redisClient,
	}
}

func (h *SummaryHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req models.GenerateSummaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	userID := middleware.GetUserID(r.Context())

	// Verify content exists and belongs to user
	content, err := h.contentRepo.GetByID(r.Context(), req.ContentID)
	if err != nil || content.UserID != userID {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Content not found", r))
		return
	}

	// Create summary record
	summary := &models.Summary{
		UserID:        userID,
		ContentID:     &req.ContentID,
		Format:        req.Format,
		LengthSetting: req.Length,
	}
	configBytes, _ := json.Marshal(req)
	summary.ConfigJSON = configBytes

	if err := h.summaryRepo.Create(r.Context(), summary); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create summary", r))
		return
	}

	// Create and queue job
	job := &models.Job{
		UserID:      userID,
		Type:        "summary-generation",
		ReferenceID: summary.ID,
		ConfigJSON:  configBytes,
	}

	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create job", r))
		return
	}

	// Push to Redis queue
	jobBytes, _ := json.Marshal(job)
	if h.redis == nil {
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Summary queue is unavailable", r))
		return
	}

	if err := h.redis.LPush(r.Context(), "queue:summary-generation", string(jobBytes)).Err(); err != nil {
		log.Printf("failed to enqueue summary-generation job %s: %v", job.ID, err)
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to enqueue summary job", r))
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":     job.ID,
		"summary_id": summary.ID,
	})
}

func (h *SummaryHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	search := r.URL.Query().Get("search")
	sortBy := r.URL.Query().Get("sort")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	if limit <= 0 || limit > 50 {
		limit = 20
	}

	summaries, total, err := h.summaryRepo.ListByUser(r.Context(), userID, search, sortBy, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch summaries", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"summaries": summaries,
		"total":     total,
		"limit":     limit,
		"offset":    offset,
	})
}

func (h *SummaryHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

func (h *SummaryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	var update struct {
		Title string   `json:"title"`
		Tags  []string `json:"tags"`
	}
	json.NewDecoder(r.Body).Decode(&update)

	if update.Title != "" {
		summary.Title = update.Title
	}
	if update.Tags != nil {
		summary.Tags = update.Tags
	}

	if err := h.summaryRepo.Update(r.Context(), summary); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update summary", r))
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

func (h *SummaryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.summaryRepo.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete summary", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Summary deleted"})
}

func (h *SummaryHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.summaryRepo.ToggleFavorite(r.Context(), id, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update favorite", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Favorite toggled"})
}

func (h *SummaryHandler) Regenerate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	userID := middleware.GetUserID(r.Context())

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	// Read new config
	var req models.GenerateSummaryRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
			writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
			return
		}
	}

	// Fallback to existing summary config when body is empty or partially missing
	if len(summary.ConfigJSON) > 0 {
		var existing models.GenerateSummaryRequest
		if err := json.Unmarshal(summary.ConfigJSON, &existing); err == nil {
			if req.ContentID == uuid.Nil {
				req.ContentID = existing.ContentID
			}
			if req.Format == "" {
				req.Format = existing.Format
			}
			if req.Length == "" {
				req.Length = existing.Length
			}
			if len(req.FocusAreas) == 0 {
				req.FocusAreas = existing.FocusAreas
			}
			if req.TargetAudience == "" {
				req.TargetAudience = existing.TargetAudience
			}
			if req.Language == "" {
				req.Language = existing.Language
			}
		}
	}

	if req.ContentID == uuid.Nil && summary.ContentID != nil {
		req.ContentID = *summary.ContentID
	}
	if req.Format == "" {
		req.Format = summary.Format
	}
	if req.Length == "" {
		req.Length = summary.LengthSetting
	}
	if req.Language == "" {
		req.Language = "en"
	}
	if req.FocusAreas == nil {
		req.FocusAreas = []string{}
	}

	configBytes, _ := json.Marshal(req)

	// Create job
	job := &models.Job{
		UserID:      userID,
		Type:        "summary-generation",
		ReferenceID: id,
		ConfigJSON:  configBytes,
	}

	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create job", r))
		return
	}

	jobBytes, _ := json.Marshal(job)
	if h.redis == nil {
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Summary queue is unavailable", r))
		return
	}

	if err := h.redis.LPush(r.Context(), "queue:summary-generation", string(jobBytes)).Err(); err != nil {
		log.Printf("failed to enqueue summary-regeneration job %s: %v", job.ID, err)
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to enqueue summary job", r))
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":     job.ID,
		"summary_id": id,
	})
}

func (h *SummaryHandler) ExportPDF(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	pdfBytes, err := generatePDF(*summary)
	if err != nil {
		log.Printf("pdf export failed for summary %s: %v", summary.ID, err)
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to export PDF", r))
		return
	}

	fileName := sanitizePDFFileName(summary.Title)
	if fileName == "" {
		fileName = "summary"
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.pdf\"", fileName))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdfBytes)
}

func generatePDF(summary models.Summary) ([]byte, error) {
	payload, err := buildPDFPayload(summary)
	if err != nil {
		return nil, err
	}

	jsonBytes, _ := json.Marshal(payload)
	tmpOut := filepath.Join(os.TempDir(), fmt.Sprintf("lectura_%s.pdf", summary.ID))

	scriptPath, err := resolvePDFScriptPath()
	if err != nil {
		return nil, err
	}

	pythonBin := "python3"
	if _, lookErr := exec.LookPath(pythonBin); lookErr != nil {
		pythonBin = "python"
		if _, lookErr2 := exec.LookPath(pythonBin); lookErr2 != nil {
			return nil, fmt.Errorf("python interpreter not found (tried python3 and python)")
		}
	}

	cmd := exec.Command(pythonBin, scriptPath, summary.Format, string(jsonBytes), tmpOut)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("pdf generation failed: %s", strings.TrimSpace(string(out)))
	}

	trimmed := strings.TrimSpace(string(out))
	if !strings.HasPrefix(trimmed, "OK:") {
		return nil, fmt.Errorf("pdf script error: %s", trimmed)
	}

	defer os.Remove(tmpOut)
	return os.ReadFile(tmpOut)
}

func resolvePDFScriptPath() (string, error) {
	candidates := []string{
		filepath.Join("backend", "scripts", "pdf_export.py"),
		filepath.Join("scripts", "pdf_export.py"),
	}

	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}

	return "", fmt.Errorf("pdf exporter script not found (checked backend/scripts/pdf_export.py and scripts/pdf_export.py)")
}

func buildPDFPayload(summary models.Summary) (map[string]interface{}, error) {
	source := strings.TrimSpace(summary.Source)
	if source == "" {
		source = "Document"
	}
	tags := summary.Tags
	if tags == nil {
		tags = []string{}
	}
	title := strings.TrimSpace(summary.Title)
	if title == "" {
		title = "Untitled Summary"
	}

	dateStr := summary.CreatedAt.Format("02.01.2006")
	format := strings.ToLower(strings.TrimSpace(summary.Format))

	base := map[string]interface{}{
		"title":       title,
		"source":      source,
		"date_str":    dateStr,
		"tags":        tags,
		"format_name": "Summary",
	}

	contentRaw := stringOrEmpty(summary.ContentRaw)
	if contentRaw == "" {
		contentRaw = "No content available."
	}

	switch format {
	case "cornell":
		base["format_name"] = "Cornell Method"
		base["cues"] = splitLines(stringOrEmpty(summary.CornellCues))
		base["notes"] = splitLines(stringOrEmpty(summary.CornellNotes))
		base["summary"] = strings.TrimSpace(stringOrEmpty(summary.CornellSummary))
		if cues, ok := base["cues"].([]string); ok && len(cues) == 0 {
			base["cues"] = []string{"No cues available."}
		}
		if notes, ok := base["notes"].([]string); ok && len(notes) == 0 {
			base["notes"] = []string{"No notes available."}
		}
		if base["summary"] == "" {
			base["summary"] = strings.TrimSpace(contentRaw)
		}
		return base, nil
	case "bullets":
		base["format_name"] = "Bullet Points"
		base["overview"] = parseOverview(contentRaw)
		base["structures"] = parseStructures(contentRaw)
		base["facts"] = parseFacts(contentRaw)
		return base, nil
	case "paragraph":
		base["format_name"] = "Paragraph"
		base["sections"] = parseSections(contentRaw)
		return base, nil
	case "smart":
		base["format_name"] = "Smart Summary"
		base["video_summary"] = parseVideoSummary(contentRaw)
		base["concepts"] = parseConcepts(contentRaw)
		base["table_data"] = parseTable(contentRaw)
		base["facts"] = parseFacts(contentRaw)
		if concepts, ok := base["concepts"].([]map[string]string); ok && len(concepts) == 0 {
			base["concepts"] = []map[string]string{{
				"title": "Key Concept",
				"body":  contentRaw,
			}}
		}
		return base, nil
	default:
		return nil, fmt.Errorf("unsupported summary format: %s", summary.Format)
	}
}

func stringOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}

func splitLines(value string) []string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	parts := strings.Split(value, "\n")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		t := strings.TrimSpace(strings.TrimPrefix(p, "- "))
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func parseOverview(content string) string {
	sections := parseSections(content)
	if len(sections) == 0 {
		return strings.TrimSpace(content)
	}
	return sections[0]["body"]
}

func parseStructures(content string) []map[string]string {
	sections := parseSections(content)
	structures := make([]map[string]string, 0)

	for i, sec := range sections {
		if i == 0 {
			continue
		}
		body := sec["body"]
		if body == "" {
			continue
		}
		structures = append(structures, map[string]string{
			"name":       sec["heading"],
			"definition": body,
			"function":   body,
			"examples":   "Not specified",
			"takeaway":   body,
		})
	}

	if len(structures) == 0 {
		body := strings.TrimSpace(content)
		if body != "" {
			structures = append(structures, map[string]string{
				"name":       "Core Structure",
				"definition": body,
				"function":   body,
				"examples":   "Not specified",
				"takeaway":   body,
			})
		}
	}

	return structures
}

func parseFacts(content string) []string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(content, "\n")
	out := make([]string, 0)

	for _, line := range lines {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "• ") || strings.HasPrefix(t, "* ") {
			t = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(t, "- "), "• "), "* "))
			if t != "" {
				out = append(out, t)
			}
		}
	}

	if len(out) == 0 {
		sections := parseSections(content)
		for _, sec := range sections {
			if strings.Contains(strings.ToLower(sec["heading"]), "fact") {
				for _, line := range strings.Split(sec["body"], "\n") {
					t := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(line, "- "), "• "), "* "))
					if t != "" {
						out = append(out, t)
					}
				}
			}
		}
	}

	if len(out) == 0 {
		trimmed := strings.TrimSpace(content)
		if trimmed != "" {
			out = []string{trimmed}
		}
	}

	return out
}

func parseSections(content string) []map[string]string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(content, "\n")

	out := make([]map[string]string, 0)
	currentHeading := "Overview"
	currentBody := make([]string, 0)

	flush := func() {
		body := strings.TrimSpace(strings.Join(currentBody, "\n"))
		if body == "" {
			return
		}
		out = append(out, map[string]string{
			"heading": currentHeading,
			"body":    body,
		})
		currentBody = []string{}
	}

	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			if len(currentBody) > 0 {
				currentBody = append(currentBody, "")
			}
			continue
		}

		if strings.HasPrefix(line, "### ") || strings.HasPrefix(line, "## ") || strings.HasPrefix(line, "# ") {
			flush()
			currentHeading = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(line, "### "), "## "), "# "))
			continue
		}

		if m := strings.Index(line, ":"); m > 0 && m < 80 {
			left := strings.TrimSpace(line[:m])
			right := strings.TrimSpace(line[m+1:])
			if right == "" && !strings.Contains(strings.ToLower(left), "http") {
				flush()
				currentHeading = left
				continue
			}
		}

		currentBody = append(currentBody, line)
	}

	flush()

	if len(out) == 0 {
		trimmed := strings.TrimSpace(content)
		if trimmed != "" {
			out = append(out, map[string]string{"heading": "Overview", "body": trimmed})
		}
	}

	return out
}

func parseVideoSummary(content string) string {
	sections := parseSections(content)
	for _, sec := range sections {
		h := strings.ToLower(sec["heading"])
		if strings.Contains(h, "summary of video") || strings.Contains(h, "overview") || strings.Contains(h, "summary") {
			if sec["body"] != "" {
				return sec["body"]
			}
		}
	}
	if len(sections) > 0 {
		return sections[0]["body"]
	}
	return strings.TrimSpace(content)
}

func parseConcepts(content string) []map[string]string {
	sections := parseSections(content)
	concepts := make([]map[string]string, 0)

	for _, sec := range sections {
		h := strings.ToLower(sec["heading"])
		if strings.Contains(h, "key insight") || strings.Contains(h, "concept") {
			body := strings.TrimSpace(sec["body"])
			if body == "" {
				continue
			}
			concepts = append(concepts, map[string]string{
				"title": sec["heading"],
				"body":  body,
			})
		}
	}

	if len(concepts) == 0 {
		lines := splitLines(content)
		for _, l := range lines {
			if strings.TrimSpace(l) != "" {
				concepts = append(concepts, map[string]string{
					"title": "Key Concept",
					"body":  l,
				})
			}
			if len(concepts) >= 5 {
				break
			}
		}
	}

	if len(concepts) == 0 {
		trimmed := strings.TrimSpace(content)
		if trimmed != "" {
			concepts = append(concepts, map[string]string{
				"title": "Key Concept",
				"body":  trimmed,
			})
		}
	}

	return concepts
}

func parseTable(content string) map[string]interface{} {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(content, "\n")

	for i := 0; i < len(lines)-1; i++ {
		headerLine := strings.TrimSpace(lines[i])
		sepLine := strings.TrimSpace(lines[i+1])

		if !(strings.HasPrefix(headerLine, "|") && strings.HasSuffix(headerLine, "|")) {
			continue
		}
		if !strings.Contains(sepLine, "---") {
			continue
		}

		headers := parsePipeRow(headerLine)
		rows := make([][]string, 0)

		j := i + 2
		for ; j < len(lines); j++ {
			rowLine := strings.TrimSpace(lines[j])
			if !(strings.HasPrefix(rowLine, "|") && strings.HasSuffix(rowLine, "|")) {
				break
			}
			row := parsePipeRow(rowLine)
			if len(row) > 0 {
				rows = append(rows, row)
			}
		}

		if len(headers) >= 2 && len(rows) > 0 {
			return map[string]interface{}{
				"title":   "Key Concepts Table",
				"headers": headers,
				"rows":    rows,
			}
		}
	}

	return nil
}

func parsePipeRow(line string) []string {
	t := strings.TrimSpace(line)
	t = strings.TrimPrefix(t, "|")
	t = strings.TrimSuffix(t, "|")
	parts := strings.Split(t, "|")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		cell := strings.TrimSpace(p)
		if cell == "" {
			cell = "Not specified"
		}
		out = append(out, cell)
	}
	return out
}

func sanitizePDFFileName(value string) string {
	invalid := `\\/:*?"<>|`
	cleaned := strings.Map(func(r rune) rune {
		if strings.ContainsRune(invalid, r) {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
	cleaned = strings.Join(strings.Fields(cleaned), " ")
	if len(cleaned) > 120 {
		cleaned = cleaned[:120]
	}
	return strings.TrimSpace(cleaned)
}
