package services

import (
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	ytapi "github.com/hightemp/youtube-transcript-api-go/api"
	yt "github.com/kkdai/youtube/v2"
)

type YouTubeService struct {
	httpClient    *http.Client
	transcriptAPI *ytapi.YouTubeTranscriptApi
	ytClient      *yt.Client
}

type timedTextXML struct {
	XMLName xml.Name  `xml:"transcript"`
	Texts   []textXML `xml:"text"`
}

type textXML struct {
	Start string `xml:"start,attr"`
	Dur   string `xml:"dur,attr"`
	Text  string `xml:",chardata"`
}

func NewYouTubeService() *YouTubeService {
	return &YouTubeService{
		httpClient:    &http.Client{Timeout: 30 * time.Second},
		transcriptAPI: ytapi.NewYouTubeTranscriptApi(),
		ytClient:      &yt.Client{},
	}
}

// GetTranscript fetches the auto-generated captions for a YouTube video
func (s *YouTubeService) GetTranscript(videoID string) (string, error) {
	transcript, err := s.transcriptAPI.GetTranscript(videoID, []string{"en", "en-US", "en-GB"})
	if err != nil {
		// Fallback: request any available language
		transcript, err = s.transcriptAPI.GetTranscript(videoID, nil)
		if err != nil {
			legacyTranscript, legacyErr := s.getTranscriptViaTimedText(videoID)
			if legacyErr == nil {
				return legacyTranscript, nil
			}
			return "", fmt.Errorf("no subtitles available via transcript API (%v) and timedtext fallback failed (%v)", err, legacyErr)
		}
	}

	if len(transcript.Entries) == 0 {
		return "", fmt.Errorf("subtitle track is empty")
	}

	var fullText strings.Builder
	for _, entry := range transcript.Entries {
		text := strings.TrimSpace(entry.Text)
		if text == "" {
			continue
		}
		fullText.WriteString(text)
		fullText.WriteString(" ")
	}

	cleaned := strings.TrimSpace(fullText.String())
	if cleaned == "" {
		return "", fmt.Errorf("subtitle text resolved to empty content")
	}

	return cleaned, nil
}

func (s *YouTubeService) getTranscriptViaTimedText(videoID string) (string, error) {
	pageURL := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	req, _ := http.NewRequest("GET", pageURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch YouTube page: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read YouTube page: %w", err)
	}

	pageHTML := string(body)
	log.Printf("TimedText fallback: fetched YouTube page for %s (%d bytes)", videoID, len(pageHTML))

	captionURL, err := extractCaptionURL(pageHTML)
	if err != nil {
		return "", err
	}

	captionResp, err := s.httpClient.Get(captionURL)
	if err != nil {
		return "", fmt.Errorf("failed to fetch captions: %w", err)
	}
	defer captionResp.Body.Close()

	captionBody, err := io.ReadAll(captionResp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read captions: %w", err)
	}

	transcript, err := parseCaptionsXML(captionBody)
	if err != nil {
		return "", fmt.Errorf("failed to parse captions XML: %w", err)
	}

	return transcript, nil
}

func extractCaptionURL(pageHTML string) (string, error) {
	re := regexp.MustCompile(`"captionTracks"\s*:\s*\[(.*?)\],\s*"`)
	matches := re.FindStringSubmatch(pageHTML)
	if len(matches) < 2 {
		re2 := regexp.MustCompile(`"playerCaptionsTracklistRenderer"\s*:\s*\{(?:.*?,)?\s*"captionTracks"\s*:\s*\[(.*?)\],\s*"`)
		matches = re2.FindStringSubmatch(pageHTML)
		if len(matches) < 2 {
			return "", fmt.Errorf("no captions available for this video")
		}
	}

	tracksJSON := matches[1]
	reURL := regexp.MustCompile(`"baseUrl"\s*:\s*"(.*?)"`)
	urlMatches := reURL.FindStringSubmatch(tracksJSON)
	if len(urlMatches) < 2 {
		return "", fmt.Errorf("caption track found but baseUrl missing")
	}

	u := urlMatches[1]
	u = strings.ReplaceAll(u, `\u0026`, "&")
	u = strings.ReplaceAll(u, `\/`, "/")

	return u, nil
}

func parseCaptionsXML(data []byte) (string, error) {
	var tt timedTextXML
	if err := xml.Unmarshal(data, &tt); err != nil {
		return "", err
	}

	var parts []string
	for _, t := range tt.Texts {
		text := html.UnescapeString(t.Text)
		text = strings.TrimSpace(text)
		if text != "" {
			parts = append(parts, text)
		}
	}

	if len(parts) == 0 {
		return "", fmt.Errorf("captions XML empty")
	}

	return strings.Join(parts, " "), nil
}

// DownloadAudio downloads the best available audio-only stream for a YouTube URL.
func (s *YouTubeService) DownloadAudio(videoURL string) ([]byte, string, error) {
	video, err := s.ytClient.GetVideo(videoURL)
	if err != nil {
		return nil, "", fmt.Errorf("failed to fetch YouTube video metadata: %w", err)
	}

	formats := video.Formats.WithAudioChannels()
	if len(formats) == 0 {
		return nil, "", fmt.Errorf("no audio formats available")
	}

	best := formats[0]
	for _, f := range formats {
		if f.Bitrate > best.Bitrate {
			best = f
		}
	}

	stream, _, err := s.ytClient.GetStream(video, &best)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open audio stream: %w", err)
	}
	defer stream.Close()

	const maxAudioBytes = 100 * 1024 * 1024 // 100MB safety cap
	limited := io.LimitReader(stream, maxAudioBytes+1)
	audioBytes, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read audio stream: %w", err)
	}
	if len(audioBytes) > maxAudioBytes {
		return nil, "", fmt.Errorf("audio stream exceeds %d MB limit", maxAudioBytes/(1024*1024))
	}

	mimeType := strings.TrimSpace(strings.Split(best.MimeType, ";")[0])
	if mimeType == "" {
		mimeType = "audio/mp4"
	}

	return audioBytes, mimeType, nil
}

// EstimateDuration parses duration from YouTube page HTML
func (s *YouTubeService) GetVideoMetadata(videoID string) (title, channel, thumbnail, description string, durationSec int, err error) {
	pageURL := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	req, _ := http.NewRequest("GET", pageURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", "", "", 0, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	// Extract title
	titleRe := regexp.MustCompile(`<title>(.*?) - YouTube</title>`)
	if m := titleRe.FindStringSubmatch(html); len(m) > 1 {
		title = m[1]
	}

	// Extract channel
	channelRe := regexp.MustCompile(`"ownerChannelName":"(.*?)"`)
	if m := channelRe.FindStringSubmatch(html); len(m) > 1 {
		channel = m[1]
	}

	// Extract description
	descRe := regexp.MustCompile(`<meta name="description" content="(.*?)">`)
	if m := descRe.FindStringSubmatch(html); len(m) > 1 {
		description = m[1]
	} else {
		// Fallback to og:description
		ogDescRe := regexp.MustCompile(`<meta property="og:description" content="(.*?)">`)
		if m := ogDescRe.FindStringSubmatch(html); len(m) > 1 {
			description = m[1]
		}
	}

	// Extract thumbnail
	thumbnail = fmt.Sprintf("https://img.youtube.com/vi/%s/maxresdefault.jpg", videoID)

	// Extract duration (in seconds from lengthSeconds)
	durRe := regexp.MustCompile(`"lengthSeconds":"(\d+)"`)
	if m := durRe.FindStringSubmatch(html); len(m) > 1 {
		fmt.Sscanf(m[1], "%d", &durationSec)
	}

	return title, channel, thumbnail, description, durationSec, nil
}
