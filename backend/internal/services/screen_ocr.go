package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type ScreenOCRService struct {
	contentRepo *repository.ContentRepo
	youtube     *YouTubeService
	gemini      *GeminiService
}

func NewScreenOCRService(contentRepo *repository.ContentRepo, youtube *YouTubeService, gemini *GeminiService) *ScreenOCRService {
	return &ScreenOCRService{
		contentRepo: contentRepo,
		youtube:     youtube,
		gemini:      gemini,
	}
}

type screenOCRItem struct {
	TSeconds int    `json:"t_seconds"`
	Text     string `json:"text"`
}

type screenOCRCache struct {
	Items []screenOCRItem `json:"items"`
}

func normalizeWhitespace(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	for _, l := range lines {
		t := strings.TrimSpace(l)
		if t == "" {
			continue
		}
		out = append(out, t)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

func parseTimeSecondsFromMessage(message string) (int, bool) {
	m := strings.ToLower(message)

	// 1) 5:00 / 01:23 / 1:02:03 (we take last two as mm:ss if 2 parts)
	reHMS := regexp.MustCompile(`\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b`)
	if match := reHMS.FindStringSubmatch(m); len(match) >= 3 {
		a, _ := strconv.Atoi(match[1])
		b, _ := strconv.Atoi(match[2])
		if match[3] != "" {
			c, _ := strconv.Atoi(match[3])
			// h:mm:ss
			return a*3600 + b*60 + c, true
		}
		// mm:ss
		return a*60 + b, true
	}

	// 2) "на 5 минуте", "5 мин", "5 minutes" (number before word)
	reMin := regexp.MustCompile(`\b(\d{1,3})\s*(минуте|минут|мин|minutes|minute|min)\b`)
	if match := reMin.FindStringSubmatch(m); len(match) >= 2 {
		mins, _ := strconv.Atoi(match[1])
		return mins * 60, true
	}

	// 2b) "minute 4", "минуте 5" (word before number)
	reMinRev := regexp.MustCompile(`\b(minutes|minute|min|минуте|минут|мин)\s+(\d{1,3})\b`)
	if match := reMinRev.FindStringSubmatch(m); len(match) >= 3 {
		mins, _ := strconv.Atoi(match[2])
		return mins * 60, true
	}

	// 3) seconds (number before word)
	reSec := regexp.MustCompile(`\b(\d{1,4})\s*(секунд|сек|seconds|second|sec)\b`)
	if match := reSec.FindStringSubmatch(m); len(match) >= 2 {
		secs, _ := strconv.Atoi(match[1])
		return secs, true
	}

	// 3b) "second 30", "секунде 45" (word before number)
	reSecRev := regexp.MustCompile(`\b(seconds|second|sec|секунде|секунд|сек)\s+(\d{1,4})\b`)
	if match := reSecRev.FindStringSubmatch(m); len(match) >= 3 {
		secs, _ := strconv.Atoi(match[2])
		return secs, true
	}

	return 0, false
}

var youtubeIDInURL = regexp.MustCompile(`(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([\w-]{11})`)

// normalizeYouTubePageURL builds a canonical watch URL so yt-dlp always gets a predictable input.
func normalizeYouTubePageURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return raw
	}
	if m := youtubeIDInURL.FindStringSubmatch(raw); len(m) == 2 {
		return "https://www.youtube.com/watch?v=" + m[1]
	}
	return raw
}

func (s *ScreenOCRService) getCachedTextNear(content *models.Content, targetSeconds int) (string, bool) {
	if content == nil || len(content.MetadataJSON) == 0 {
		return "", false
	}

	var meta map[string]any
	if err := json.Unmarshal(content.MetadataJSON, &meta); err != nil {
		return "", false
	}
	raw, ok := meta["screen_ocr"]
	if !ok {
		return "", false
	}
	bytes, err := json.Marshal(raw)
	if err != nil {
		return "", false
	}
	var cache screenOCRCache
	if err := json.Unmarshal(bytes, &cache); err != nil {
		return "", false
	}
	if len(cache.Items) == 0 {
		return "", false
	}

	// Find closest within ±15 seconds
	bestIdx := -1
	bestDist := 1<<30
	for i, it := range cache.Items {
		d := it.TSeconds - targetSeconds
		if d < 0 {
			d = -d
		}
		if d < bestDist {
			bestDist = d
			bestIdx = i
		}
	}
	if bestIdx < 0 || bestDist > 15 {
		return "", false
	}
	return strings.TrimSpace(cache.Items[bestIdx].Text), true
}

func (s *ScreenOCRService) storeCacheItem(ctx context.Context, contentID uuid.UUID, existing *models.Content, item screenOCRItem) error {
	meta := map[string]any{}
	if existing != nil && len(existing.MetadataJSON) > 0 {
		_ = json.Unmarshal(existing.MetadataJSON, &meta)
	}

	var cache screenOCRCache
	if raw, ok := meta["screen_ocr"]; ok {
		if b, err := json.Marshal(raw); err == nil {
			_ = json.Unmarshal(b, &cache)
		}
	}

	// Dedup by time (within ±2s)
	filtered := make([]screenOCRItem, 0, len(cache.Items)+1)
	for _, it := range cache.Items {
		if it.TSeconds-item.TSeconds <= 2 && item.TSeconds-it.TSeconds <= 2 {
			continue
		}
		filtered = append(filtered, it)
	}
	filtered = append(filtered, item)
	cache.Items = filtered
	meta["screen_ocr"] = cache

	out, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	return s.contentRepo.UpdateMetadata(ctx, contentID, out)
}

func formatYTDLPTime(sec int) string {
	if sec < 0 {
		sec = 0
	}
	h := sec / 3600
	m := (sec % 3600) / 60
	s := sec % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%d:%02d", m, s)
}

func ocrSummaryBlock(tSec int, body string) string {
	return fmt.Sprintf("\n\nON-SCREEN TEXT AT ~%02d:%02d:\n%s", tSec/60, tSec%60, body)
}

func (s *ScreenOCRService) extractFramePNGFromPath(ctx context.Context, videoPath string, tSeconds int) ([]byte, error) {
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-ss", fmt.Sprintf("%d", tSeconds),
		"-i", videoPath,
		"-frames:v", "1",
		"-vf", "scale=1280:-1",
		"-f", "image2pipe",
		"-vcodec", "png",
		"pipe:1",
	}
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return nil, fmt.Errorf("ffmpeg frame extract failed: %s", errMsg)
	}
	png := stdout.Bytes()
	if len(png) < 8 {
		return nil, fmt.Errorf("ffmpeg returned empty frame")
	}
	return png, nil
}

// ytDlpFFmpegLocationArgs passes --ffmpeg-location when a binary exists (yt-dlp invokes ffmpeg for sections).
func ytDlpFFmpegLocationArgs() []string {
	if p := strings.TrimSpace(os.Getenv("FFMPEG_PATH")); p != "" {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return []string{"--ffmpeg-location", p}
		}
	}
	for _, p := range []string{"/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"} {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return []string{"--ffmpeg-location", p}
		}
	}
	return nil
}

// tryExtractFrameYtDlp downloads only a short segment around targetSec (via yt-dlp) and grabs one frame.
// This avoids buffering the whole video — the previous approach often truncated MP4 before the seek time.
// YouTube often blocks the default web client; we retry with alternate player_client values.
func (s *ScreenOCRService) tryExtractFrameYtDlp(ctx context.Context, pageURL string, targetSec int) ([]byte, error) {
	tmpDir, err := os.MkdirTemp("", "lectura-ytdlp-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)

	start := targetSec - 5
	if start < 0 {
		start = 0
	}
	end := targetSec + 12
	section := fmt.Sprintf("*%s-%s", formatYTDLPTime(start), formatYTDLPTime(end))
	localSeek := targetSec - start
	if localSeek < 0 {
		localSeek = 0
	}

	ytdlpCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	strategies := []struct {
		name      string
		format    string
		extraArgs []string
	}{
		{
			// Prefer a loose selector first: strict mp4/480p often matches nothing on modern AV1/WebM streams.
			name:   "loose720",
			format: "bv*[height<=720]/bv*/bestvideo[height<=720]/bestvideo",
		},
		{
			name:   "any_video",
			format: "bv*",
		},
		{
			name:   "strict480",
			format: "bv*[height<=480][ext=mp4]/bv*[height<=480]/bv*[ext=mp4]/bv*",
		},
		{
			name:      "android",
			format:    "bv*[height<=720]/bv*",
			extraArgs: []string{"--extractor-args", "youtube:player_client=android"},
		},
		{
			name:      "web",
			format:    "bestvideo[height<=720]/bestvideo/bv*",
			extraArgs: []string{"--extractor-args", "youtube:player_client=web"},
		},
		{
			name:      "ios",
			format:    "bv*",
			extraArgs: []string{"--extractor-args", "youtube:player_client=ios"},
		},
	}

	var lastErr error
	for _, st := range strategies {
		subDir := filepath.Join(tmpDir, st.name)
		if err := os.MkdirAll(subDir, 0o700); err != nil {
			return nil, err
		}
		outTemplate := filepath.Join(subDir, "clip.%(ext)s")

		args := []string{
			"-m", "yt_dlp",
			"--no-playlist",
			"-f", st.format,
			"--download-sections", section,
			"--force-overwrites",
			"-o", outTemplate,
		}
		args = append(args, ytDlpFFmpegLocationArgs()...)
		args = append(args, st.extraArgs...)
		args = append(args, pageURL)

		cmd := exec.CommandContext(ytdlpCtx, "python3", args...)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")

		if err := cmd.Run(); err != nil {
			e := fmt.Errorf("%s: %w (%s)", st.name, err, strings.TrimSpace(stderr.String()))
			log.Printf("screen OCR: yt-dlp try %q failed: %v", st.name, e)
			lastErr = e
			continue
		}

		matches, _ := filepath.Glob(filepath.Join(subDir, "clip.*"))
		if len(matches) == 0 {
			lastErr = fmt.Errorf("%s: yt-dlp produced no output file", st.name)
			log.Printf("screen OCR: %v", lastErr)
			continue
		}
		videoPath := matches[0]

		ffCtx, ffCancel := context.WithTimeout(ctx, 60*time.Second)
		png, ferr := s.extractFramePNGFromPath(ffCtx, videoPath, localSeek)
		ffCancel()
		if ferr != nil {
			log.Printf("screen OCR: ffmpeg after yt-dlp %q: %v", st.name, ferr)
			lastErr = ferr
			continue
		}
		return png, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("yt-dlp: all strategies exhausted")
	}
	return nil, lastErr
}

func (s *ScreenOCRService) extractFramePNG(ctx context.Context, videoBytes []byte, tSeconds int) ([]byte, error) {
	tmpDir, err := os.MkdirTemp("", "lectura-ocr-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)
	inPath := filepath.Join(tmpDir, "in.mp4")
	if err := os.WriteFile(inPath, videoBytes, 0o600); err != nil {
		return nil, err
	}
	runCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	return s.extractFramePNGFromPath(runCtx, inPath, tSeconds)
}

// ScreenOCRForChat returns text to append to the summary context (including the ON-SCREEN prefix)
// and an optional short Russian hint for the UI when the user asked about a timestamp but no OCR text could be attached.
func (s *ScreenOCRService) ScreenOCRForChat(ctx context.Context, contentID *uuid.UUID, message string) (summaryAppend string, userHint string, err error) {
	target, has := parseTimeSecondsFromMessage(message)
	if !has {
		return "", "", nil
	}
	if contentID == nil || *contentID == uuid.Nil {
		return "", "Вопросы вида «что на экране в 3:00» работают только если конспект создан из YouTube (ссылка проверена кнопкой «Validate»). У этого конспекта нет привязки к видео.", nil
	}

	content, err := s.contentRepo.GetByID(ctx, *contentID)
	if err != nil {
		return "", "", err
	}

	if cached, hit := s.getCachedTextNear(content, target); hit && cached != "" {
		return ocrSummaryBlock(target, cached), "", nil
	}

	if content.Type != "youtube" || content.SourceURL == nil || strings.TrimSpace(*content.SourceURL) == "" {
		return "", "Распознавание кадра доступно только для конспектов по YouTube. Здесь источник не видео YouTube.", nil
	}

	videoURL := normalizeYouTubePageURL(*content.SourceURL)

	png, ytdlpErr := s.tryExtractFrameYtDlp(ctx, videoURL, target)
	if ytdlpErr != nil {
		log.Printf("screen OCR: yt-dlp path failed: %v", ytdlpErr)
		videoBytes, _, dlErr := s.youtube.DownloadVideo(videoURL)
		if dlErr != nil {
			log.Printf("screen OCR: DownloadVideo fallback failed: %v", dlErr)
			return "", "YouTube не отдал фрагмент видео (часто сеть, регион или защита ролика). Смотрите логи: docker logs lectura-backend — строки «yt-dlp». Обновите образ бэкенда, попробуйте другой ролик или VPN.", nil
		}
		var fallbackErr error
		png, fallbackErr = s.extractFramePNG(ctx, videoBytes, target)
		if fallbackErr != nil {
			log.Printf("screen OCR: ffmpeg on buffered download failed: %v", fallbackErr)
			return "", "Кадр из видео извлечь не удалось. Для длинных роликов нужен yt-dlp (образ Docker после обновления). Локально: установите yt-dlp и ffmpeg в PATH.", nil
		}
	}

	ocrText, ocrErr := s.gemini.OCRImage(ctx, png, "image/png")
	if ocrErr != nil {
		log.Printf("screen OCR: gemini OCR failed: %v", ocrErr)
		return "", "Кадр получен, но распознать текст на экране не вышло. Попробуйте другую отметку времени.", nil
	}
	ocrText = normalizeWhitespace(ocrText)
	if ocrText == "" {
		return "", "На кадре в этот момент нет читаемого текста (или картинка пустая).", nil
	}

	_ = s.storeCacheItem(ctx, content.ID, content, screenOCRItem{TSeconds: target, Text: ocrText})
	return ocrSummaryBlock(target, ocrText), "", nil
}

