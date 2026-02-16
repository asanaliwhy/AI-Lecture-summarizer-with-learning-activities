package handlers

import (
	"encoding/json"
	"testing"
)

func TestDefaultNotificationPreferences(t *testing.T) {
	prefs := defaultNotificationPreferences()

	if prefs["processing_complete"] != true {
		t.Fatalf("expected processing_complete default true")
	}

	if prefs["weekly_digest"] != false {
		t.Fatalf("expected weekly_digest default false")
	}

	if prefs["study_reminders"] != false {
		t.Fatalf("expected study_reminders default false")
	}
}

func TestMergeNotificationPreferences_ValidValues(t *testing.T) {
	raw := json.RawMessage(`{"processing_complete":false,"weekly_digest":true,"study_reminders":true,"weekly_goal_target":7}`)

	prefs := mergeNotificationPreferences(raw)

	if prefs["processing_complete"] != false {
		t.Fatalf("expected processing_complete false after merge")
	}

	if prefs["weekly_digest"] != true {
		t.Fatalf("expected weekly_digest true after merge")
	}

	if prefs["study_reminders"] != true {
		t.Fatalf("expected study_reminders true after merge")
	}

	if len(prefs) != 3 {
		t.Fatalf("expected exactly 3 notification keys, got %d", len(prefs))
	}
}

func TestMergeNotificationPreferences_InvalidOrMissingValues(t *testing.T) {
	raw := json.RawMessage(`{"processing_complete":"false","weekly_digest":1}`)

	prefs := mergeNotificationPreferences(raw)

	if prefs["processing_complete"] != true {
		t.Fatalf("expected processing_complete to remain default true when value type is invalid")
	}

	if prefs["weekly_digest"] != false {
		t.Fatalf("expected weekly_digest to remain default false when value type is invalid")
	}

	if prefs["study_reminders"] != false {
		t.Fatalf("expected study_reminders default false when missing")
	}
}
