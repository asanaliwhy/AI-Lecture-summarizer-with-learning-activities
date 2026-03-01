package main

import (
	"fmt"
	"log"

	"lectura-backend/internal/services"
)

func main() {
	yt := services.NewYouTubeService()

	testIDs := []string{
		"7D-gxaie6UI", // Crash Course
		"dQw4w9WgXcQ", // Rick Astley
	}

	for _, id := range testIDs {
		fmt.Printf("\n=== Testing video: %s ===\n", id)
		transcript, err := yt.GetTranscript(id)
		if err != nil {
			fmt.Printf("ERROR: %v\n", err)
		} else {
			if len(transcript) > 200 {
				fmt.Printf("SUCCESS: Got %d chars. First 200: %s...\n", len(transcript), transcript[:200])
			} else {
				fmt.Printf("SUCCESS: Got %d chars: %s\n", len(transcript), transcript)
			}
		}
	}

	log.Println("Done.")
}
