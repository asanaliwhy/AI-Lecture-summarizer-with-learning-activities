package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode"

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
	UpdateTitle(ctx context.Context, id uuid.UUID, title string) error
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

	if limit <= 0 || limit > 1000 {
		limit = 1000 // High default to support frontend's unpaginated full-list filtering
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
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&update); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if strings.TrimSpace(update.Title) == "" && update.Tags == nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "No fields to update", r))
		return
	}

	if update.Title != "" {
		summary.Title = strings.TrimSpace(update.Title)
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

	// Clear stale metadata so UI reflects processing state during regeneration
	_ = h.summaryRepo.Update(r.Context(), &models.Summary{
		ID:    id,
		Title: "",
		Tags:  []string{},
	})

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":     job.ID,
		"summary_id": id,
	})
}

// PDF export is handled client-side via jsPDF in src/pages/SummaryPage.tsx.
// The previous backend pdf_export.py pipeline was removed to avoid dual-path drift.

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

	// First pass: find a section explicitly named as an overview
	for _, sec := range sections {
		if isOverviewHeading(sec["heading"]) {
			return sec["body"]
		}
	}

	// Fallback: return the first section regardless of heading
	return sections[0]["body"]
}

func parseStructures(content string) []map[string]string {
	sections := parseSections(content)
	structures := make([]map[string]string, 0)

	for _, sec := range sections {
		heading := sec["heading"]
		body := sec["body"]
		if body == "" {
			continue
		}

		// Skip overview and facts sections — they belong to other fields
		if isOverviewHeading(heading) || isFactsHeading(heading) {
			continue
		}

		structures = append(structures, map[string]string{
			"name":       heading,
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
			if isFactsHeading(sec["heading"]) {
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

func isOverviewHeading(heading string) bool {
	lower := strings.ToLower(strings.TrimSpace(heading))
	return lower == "overview" ||
		strings.HasPrefix(lower, "overview") ||
		lower == "introduction" ||
		lower == "summary" ||
		lower == "background"
}

func isFactsHeading(heading string) bool {
	lower := strings.ToLower(strings.TrimSpace(heading))
	return strings.Contains(lower, "fact") ||
		strings.Contains(lower, "interesting") ||
		strings.Contains(lower, "notable") ||
		strings.Contains(lower, "fun fact") ||
		strings.Contains(lower, "did you know") ||
		strings.Contains(lower, "additional")
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

		if looksLikeAllCapsHeading(line) {
			flush()
			currentHeading = line
			continue
		}

		if looksLikeColonHeading(line) {
			flush()
			currentHeading = strings.TrimSpace(strings.TrimSuffix(line, ":"))
			continue
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

func looksLikeAllCapsHeading(line string) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return false
	}
	if len(strings.Fields(trimmed)) > 6 {
		return false
	}
	if len([]rune(trimmed)) <= 2 {
		return false
	}
	return trimmed == strings.ToUpper(trimmed)
}

func looksLikeColonHeading(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.HasSuffix(trimmed, ":") {
		return false
	}

	beforeColon := strings.TrimSpace(strings.TrimSuffix(trimmed, ":"))
	if beforeColon == "" {
		return false
	}
	if strings.Contains(strings.ToLower(beforeColon), "http") {
		return false
	}
	if strings.ContainsAny(beforeColon, ".!?") {
		return false
	}

	words := strings.Fields(beforeColon)
	if len(words) < 1 || len(words) > 5 {
		return false
	}

	runes := []rune(beforeColon)
	if len(runes) == 0 || !unicode.IsUpper(runes[0]) {
		return false
	}

	return true
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

// truncateConceptBody strips table data, section headings, and facts
// from a concept body so it only contains the concept's own prose.
func truncateConceptBody(body string) string {
	lines := strings.Split(body, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Stop at markdown tables (pipe rows)
		if strings.HasPrefix(trimmed, "|") && strings.HasSuffix(trimmed, "|") {
			break
		}
		// Stop at markdown section headings
		if strings.HasPrefix(trimmed, "##") || strings.HasPrefix(trimmed, "###") {
			break
		}
		// Stop at "Additional Interesting Facts" or similar section labels
		lower := strings.ToLower(trimmed)
		if strings.Contains(lower, "additional interesting facts") ||
			strings.Contains(lower, "interesting facts") {
			break
		}
		// Stop at table separator rows
		if regexp.MustCompile(`^\|[\s\-:|]+\|$`).MatchString(trimmed) {
			break
		}
		kept = append(kept, line)
	}
	return strings.TrimSpace(strings.Join(kept, "\n"))
}

func parseConcepts(content string) []map[string]string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	concepts := make([]map[string]string, 0)

	// Strategy 1: Look for individual Key Concept blocks using regex.
	// Handles patterns like:
	//   **Key Concept: Title**\nbody text
	//   Key Concept: Title\nbody text
	//   **Key Concept: Title** body text (inline)
	kcRegex := regexp.MustCompile(`(?mi)\*{0,2}Key\s+Concept\s*:\s*`)
	indices := kcRegex.FindAllStringIndex(content, -1)

	if len(indices) >= 2 {
		// Multiple Key Concept blocks found — split at each boundary
		for k, loc := range indices {
			var block string
			if k+1 < len(indices) {
				block = content[loc[1]:indices[k+1][0]]
			} else {
				block = content[loc[1]:]
			}

			// Clean trailing ** from titles and split title from body
			block = strings.TrimSpace(block)
			// Remove bold wrappers: "Title**\nbody" or "Title** body"
			parts := regexp.MustCompile(`\*{2}\s*`).Split(block, 2)

			title := strings.TrimSpace(parts[0])
			body := ""
			if len(parts) > 1 {
				body = strings.TrimSpace(parts[1])
			} else {
				// Title and body on separate lines
				lines := strings.SplitN(title, "\n", 2)
				title = strings.TrimSpace(lines[0])
				if len(lines) > 1 {
					body = strings.TrimSpace(lines[1])
				}
			}

			// Clean any markdown bold markers from title
			title = strings.ReplaceAll(title, "**", "")
			title = strings.TrimSpace(title)
			if title == "" {
				continue
			}

			// Truncate body at section/table boundaries
			body = truncateConceptBody(body)

			concepts = append(concepts, map[string]string{
				"title": title,
				"body":  body,
			})
		}
		return concepts
	}

	// Strategy 2: Single Key Concept or section-based detection (original logic)
	sections := parseSections(content)
	for _, sec := range sections {
		h := strings.ToLower(sec["heading"])
		if strings.Contains(h, "key insight") || strings.Contains(h, "concept") {
			body := truncateConceptBody(strings.TrimSpace(sec["body"]))
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
	const maxFileNameRunes = 120
	runes := []rune(cleaned)
	if len(runes) > maxFileNameRunes {
		cleaned = string(runes[:maxFileNameRunes])
	}
	return strings.TrimSpace(cleaned)
}
