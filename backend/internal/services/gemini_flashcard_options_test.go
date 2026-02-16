package services

import (
	"testing"

	"lectura-backend/internal/models"
)

func TestValidateFlashcardCards_IncludeOptionsGenerateContent(t *testing.T) {
	input := []models.FlashcardCard{
		{
			Front:      "Binary Search Tree",
			Back:       "A hierarchical data structure that maintains sorted order for fast search.",
			Difficulty: 2,
		},
	}

	cfg := models.GenerateFlashcardsRequest{
		NumCards:         1,
		Strategy:         "term_definition",
		IncludeMnemonics: true,
		IncludeExamples:  true,
	}

	got := validateFlashcardCards(input, cfg)
	if len(got) != 1 {
		t.Fatalf("expected 1 card, got %d", len(got))
	}

	if got[0].Mnemonic == nil || *got[0].Mnemonic == "" {
		t.Fatalf("expected mnemonic to be present when include_mnemonics=true")
	}

	if got[0].Example == nil || *got[0].Example == "" {
		t.Fatalf("expected example to be present when include_examples=true")
	}
}

func TestValidateFlashcardCards_IncludeOptionsDisabledForceNil(t *testing.T) {
	mnemonic := "remember this"
	example := "example usage"

	input := []models.FlashcardCard{
		{
			Front:      "Hash map",
			Back:       "A key-value data structure.",
			Mnemonic:   &mnemonic,
			Example:    &example,
			Difficulty: 2,
		},
	}

	cfg := models.GenerateFlashcardsRequest{
		NumCards:         1,
		Strategy:         "term_definition",
		IncludeMnemonics: false,
		IncludeExamples:  false,
	}

	got := validateFlashcardCards(input, cfg)
	if len(got) != 1 {
		t.Fatalf("expected 1 card, got %d", len(got))
	}

	if got[0].Mnemonic != nil {
		t.Fatalf("expected mnemonic to be nil when include_mnemonics=false")
	}

	if got[0].Example != nil {
		t.Fatalf("expected example to be nil when include_examples=false")
	}
}
