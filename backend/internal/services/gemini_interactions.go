package services

import (
	"context"
	"fmt"
	"log"
	"strings"

	newgenai "google.golang.org/genai"
	interactionsmodel "google.golang.org/genai/interactions/models/interactions"
	"google.golang.org/genai/interactions/models/operations"
)

// generateSummaryWithInteractions uses the current Google GenAI Go SDK and
// Interactions API. The response is consumed as SSE step.delta events so a
// slow generation does not look like an idle unary request to the server.
// The assembled text is returned to the existing summary pipeline, preserving
// its parsing, validation, persistence, and WebSocket status behavior.
func (s *GeminiService) generateSummaryWithInteractions(ctx context.Context, prompt string) (string, error) {
	if s.interactions == nil {
		return "", fmt.Errorf("Gemini Interactions client is not configured")
	}

	requestCtx, cancel := context.WithTimeout(ctx, geminiSummaryTimeout)
	defer cancel()
	log.Printf("Gemini Interactions summary request started (timeout: %s)", geminiSummaryTimeout)

	request := newInteractionsRequest(prompt, true)

	response, err := s.interactions.Interactions.Create(requestCtx, request)
	if err != nil {
		return s.retryInteractionsUnary(requestCtx, prompt, fmt.Errorf("stream request failed: %w", err))
	}
	if response == nil || response.InteractionSSEStreamEvent == nil {
		return s.retryInteractionsUnary(requestCtx, prompt, fmt.Errorf("Gemini Interactions API returned a non-stream response"))
	}

	eventStream := response.InteractionSSEStreamEvent
	defer eventStream.Close()

	var output strings.Builder
	for eventStream.Next() {
		event := eventStream.Value()
		if event == nil {
			continue
		}
		if delta := event.GetDataStepDelta(); delta != nil {
			if textDelta := delta.GetDeltaText(); textDelta != nil {
				output.WriteString(textDelta.GetText())
			}
		}
	}
	if err := eventStream.Err(); err != nil {
		return s.retryInteractionsUnary(requestCtx, prompt, fmt.Errorf("stream ended before completion: %w", err))
	}

	text := strings.TrimSpace(output.String())
	if text == "" {
		return s.retryInteractionsUnary(requestCtx, prompt, fmt.Errorf("Gemini Interactions API returned empty text"))
	}
	log.Printf("Gemini Interactions summary request completed (%d characters)", len(text))
	return text, nil
}

func newInteractionsRequest(prompt string, stream bool) operations.CreateInteractionRequest {
	return operations.CreateInteractionRequest{
		Body: operations.NewCreateInteractionRequestBody(interactionsmodel.CreateModelInteraction{
			Model:  interactionsmodel.Model("gemini-3.8-flash"),
			Input:  newgenai.Ptr(interactionsmodel.NewInteractionsInput(prompt)),
			Stream: newgenai.Ptr(stream),
		}),
	}
}

// retryInteractionsUnary keeps the new Interactions API as the source of
// truth while protecting jobs from a proxy/API connection that closes an SSE
// response before its [DONE] sentinel arrives.
func (s *GeminiService) retryInteractionsUnary(ctx context.Context, prompt string, streamErr error) (string, error) {
	response, err := s.interactions.Interactions.Create(ctx, newInteractionsRequest(prompt, false))
	if err != nil {
		return "", fmt.Errorf("%v; unary retry failed: %w", streamErr, err)
	}
	if response == nil || response.Interaction == nil || response.Interaction.OutputText == nil {
		return "", fmt.Errorf("%v; unary retry returned empty output", streamErr)
	}

	text := strings.TrimSpace(*response.Interaction.OutputText)
	if text == "" {
		return "", fmt.Errorf("%v; unary retry returned empty text", streamErr)
	}
	return text, nil
}
