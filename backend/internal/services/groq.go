package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	oldgenai "github.com/google/generative-ai-go/genai"
)

const groqChatCompletionsURL = "https://api.groq.com/openai/v1/chat/completions"

const (
	groqRequestBudgetTokens = 7600 // keep a buffer below the 8k free-tier limit
	groqMaxCompletionTokens = 6000
)

type groqChatRequest struct {
	Model       string            `json:"model"`
	Messages    []groqChatMessage `json:"messages"`
	Temperature float64           `json:"temperature,omitempty"`
	MaxTokens   int               `json:"max_tokens,omitempty"`
}

type groqChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type groqChatResponse struct {
	Choices []struct {
		Message groqChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (s *GeminiService) generateWithGroq(ctx context.Context, prompt string, timeout time.Duration) (string, error) {
	if strings.TrimSpace(s.groqAPIKey) == "" {
		return "", fmt.Errorf("GROQ_API_KEY is not configured")
	}
	model := strings.TrimSpace(s.groqModel)
	if model == "" {
		model = "openai/gpt-oss-20b"
	}

	// Groq's free tier counts prompt and completion tokens together. A fixed
	// completion cap still fails for longer prompts, so reserve part of the
	// request budget for the prompt itself.
	promptTokens := (len([]rune(prompt)) + 3) / 4
	completionTokens := groqMaxCompletionTokens
	if available := groqRequestBudgetTokens - promptTokens; available < completionTokens {
		completionTokens = available
	}
	if completionTokens < 512 {
		return "", fmt.Errorf("prompt is too large for Groq free-tier request limit")
	}

	requestBody := groqChatRequest{
		Model: model,
		Messages: []groqChatMessage{
			{Role: "user", Content: prompt},
		},
		Temperature: 0.3,
		// Groq's free on-demand tier currently enforces an 8k TPM request
		// budget. Keeping completion tokens below that budget leaves room for
		// the transcript and instructions in the same request.
		MaxTokens:   completionTokens,
	}
	body, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("encode request: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, groqChatCompletionsURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.groqAPIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: timeout + 5*time.Second}
	resp, err := client.Do(req)
	if err != nil {
		if callCtx.Err() != nil {
			return "", fmt.Errorf("request timed out after %s", timeout)
		}
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	var response groqChatResponse
	if err := json.Unmarshal(responseBody, &response); err != nil {
		return "", fmt.Errorf("decode response (%s): %w", resp.Status, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if response.Error != nil && response.Error.Message != "" {
			return "", fmt.Errorf("%s", response.Error.Message)
		}
		return "", fmt.Errorf("HTTP %s", resp.Status)
	}
	if len(response.Choices) == 0 || strings.TrimSpace(response.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("empty response from model %s", model)
	}
	return strings.TrimSpace(response.Choices[0].Message.Content), nil
}

// generateTextWithProvider routes text-only generation to Groq when it is
// configured, while retaining Gemini as the local/dev fallback.
func (s *GeminiService) generateTextWithProvider(ctx context.Context, prompt string, timeout time.Duration) (string, error) {
	if strings.TrimSpace(s.groqAPIKey) != "" {
		return s.generateWithGroq(ctx, prompt, timeout)
	}
	resp, err := generateContentWithTimeout(ctx, s.model, timeout, oldgenai.Text(prompt))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(extractText(resp)), nil
}
