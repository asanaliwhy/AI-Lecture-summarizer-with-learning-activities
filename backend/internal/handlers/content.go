package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type ContentHandler struct {
	contentRepo *repository.ContentRepo
	jobRepo     *repository.JobRepo
	redis       *redis.Client
	storagePath string
}

func NewContentHandler(contentRepo *repository.ContentRepo, jobRepo *repository.JobRepo, redisClient *redis.Client, storagePath string) *ContentHandler {
	if redisClient == nil {
		log.Println("CRITICAL: NewContentHandler received nil redisClient")
	} else {
		log.Printf("DEBUG: NewContentHandler initialized with redisClient: %v", redisClient)
	}
	return &ContentHandler{
		contentRepo: contentRepo,
		jobRepo:     jobRepo,
		redis:       redisClient,
		storagePath: storagePath,
	}
}

var youtubeRegex = regexp.MustCompile(`(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([\w-]{11})`)

func (h *ContentHandler) ValidateYouTube(w http.ResponseWriter, r *http.Request) {
	var req models.ValidateYouTubeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	matches := youtubeRegex.FindStringSubmatch(req.URL)
	if len(matches) < 2 {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid YouTube URL", r))
		return
	}

	videoID := matches[1]
	userID := middleware.GetUserID(r.Context())

	content := &models.Content{
		UserID:    userID,
		Type:      "youtube",
		Status:    "pending",
		SourceURL: &req.URL,
		Title:     "YouTube Video: " + videoID,
	}

	// Fetch metadata from oEmbed
	oembedURL := "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + videoID + "&format=json"
	resp, err := http.Get(oembedURL)
	var oembed struct {
		Title        string `json:"title"`
		AuthorName   string `json:"author_name"`
		ThumbnailURL string `json:"thumbnail_url"`
	}

	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		json.NewDecoder(resp.Body).Decode(&oembed)
	}

	// Fallback if oEmbed fails or for fields not in oEmbed
	if oembed.Title == "" {
		oembed.Title = "YouTube Video"
	}
	if oembed.AuthorName == "" {
		oembed.AuthorName = "YouTube Channel"
	}
	// Default high-res thumbnail if not provided
	if oembed.ThumbnailURL == "" {
		oembed.ThumbnailURL = "https://img.youtube.com/vi/" + videoID + "/maxresdefault.jpg"
	}

	metadata := models.YouTubeMetadata{
		VideoID:      videoID,
		Title:        oembed.Title,
		ChannelName:  oembed.AuthorName,
		ThumbnailURL: oembed.ThumbnailURL,
		Duration:     0, // oEmbed doesn't provide duration
	}
	metaBytes, _ := json.Marshal(metadata)
	content.MetadataJSON = metaBytes
	content.Title = oembed.Title

	if err := h.contentRepo.Create(r.Context(), content); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create content record", r))
		return
	}

	// Trigger async transcript extraction
	jobID := uuid.New()
	job := &models.Job{
		ID:          jobID,
		UserID:      userID,
		Type:        "content-processing",
		Status:      "queued",
		ReferenceID: content.ID,
		CreatedAt:   time.Now(),
	}

	if err := h.jobRepo.Create(r.Context(), job); err == nil {
		if h.redis == nil {
			log.Println("CRITICAL: h.redis is nil in ValidateYouTube, cannot enqueue job")
		} else {
			jobBytes, _ := json.Marshal(job)
			h.redis.LPush(r.Context(), "queue:content-processing", string(jobBytes))
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"content_id": content.ID,
		"video_id":   videoID,
		"metadata":   metadata,
		"valid":      true,
	})
}

func (h *ContentHandler) Upload(w http.ResponseWriter, r *http.Request) {
	// Check content length
	if r.ContentLength > 100*1024*1024 { // 100MB
		writeJSON(w, http.StatusRequestEntityTooLarge, errorResp("FILE_TOO_LARGE", "File size exceeds 100MB limit", r))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 100*1024*1024)

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "No file provided", r))
		return
	}
	defer file.Close()

	// Read first 512 bytes for magic byte check
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	buf = buf[:n]

	mimeType := http.DetectContentType(buf)
	if !isAllowedMimeType(mimeType, header.Filename) {
		writeJSON(w, http.StatusUnsupportedMediaType, errorResp("UNSUPPORTED_FORMAT", "File type not supported", r))
		return
	}

	// Reset file reader
	file.Seek(0, io.SeekStart)

	userID := middleware.GetUserID(r.Context())
	fileID := uuid.New().String()
	ext := getExtension(header.Filename)
	storagePath := "users/" + userID.String() + "/uploads/" + fileID + ext

	content := &models.Content{
		UserID:   userID,
		Type:     "file",
		Status:   "pending",
		FilePath: &storagePath,
		Title:    header.Filename,
	}

	if err := h.contentRepo.Create(r.Context(), content); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create content record", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"content_id": content.ID,
		"filename":   header.Filename,
		"mime_type":  mimeType,
	})
}

func (h *ContentHandler) SupportedFormats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"formats": []map[string]string{
			{"extension": ".pdf", "mime_type": "application/pdf", "description": "PDF Document"},
			{"extension": ".docx", "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "description": "Word Document"},
			{"extension": ".txt", "mime_type": "text/plain", "description": "Plain Text"},
			{"extension": ".mp4", "mime_type": "video/mp4", "description": "MP4 Video"},
			{"extension": ".mp3", "mime_type": "audio/mpeg", "description": "MP3 Audio"},
			{"extension": ".wav", "mime_type": "audio/wav", "description": "WAV Audio"},
		},
	})
}

func (h *ContentHandler) GetContent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid content ID", r))
		return
	}

	content, err := h.contentRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Content not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if content.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	writeJSON(w, http.StatusOK, content)
}

func isAllowedMimeType(mime, filename string) bool {
	allowed := map[string]bool{
		"application/pdf":          true,
		"text/plain":               true,
		"video/mp4":                true,
		"audio/mpeg":               true,
		"audio/wav":                true,
		"application/octet-stream": true,
	}
	if allowed[mime] {
		return true
	}
	// Check by extension as fallback
	lower := strings.ToLower(filename)
	return strings.HasSuffix(lower, ".pdf") || strings.HasSuffix(lower, ".docx") ||
		strings.HasSuffix(lower, ".txt") || strings.HasSuffix(lower, ".mp4") ||
		strings.HasSuffix(lower, ".mp3") || strings.HasSuffix(lower, ".wav")
}

func getExtension(filename string) string {
	idx := strings.LastIndex(filename, ".")
	if idx < 0 {
		return ""
	}
	return filename[idx:]
}

// Suppress unused import warnings
var _ = chi.URLParam
