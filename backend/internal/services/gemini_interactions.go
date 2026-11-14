package services

import (
	"context"
	"fmt"
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

	stream := true
	request := operations.CreateInteractionRequest{
		Body: operations.NewCreateInteractionRequestBody(interactionsmodel.CreateModelInteraction{
			Model:  interactionsmodel.Model("gemini-3.8-flash"),
			Input:  newgenai.Ptr(interactionsmodel.NewInteractionsInput(prompt)),
			Stream: &stream,
		}),
	}

	response, err := s.interactions.Interactions.Create(ctx, request)
	if err != nil {
		return "", err
	}
	if response == nil || response.InteractionSSEStreamEvent == nil {
		return "", fmt.Errorf("Gemini Interactions API returned a non-stream response")
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
		return "", err
	}

	text := strings.TrimSpace(output.String())
	if text == "" {
		return "", fmt.Errorf("Gemini Interactions API returned empty text")
	}
	return text, nil
}
