package services

import (
	"testing"
	"time"
)

func TestShouldSendByLastSent(t *testing.T) {
	now := time.Date(2026, 2, 16, 10, 0, 0, 0, time.UTC)

	if !shouldSendByLastSent("", 24*time.Hour, now) {
		t.Fatalf("expected empty last-sent value to allow sending")
	}

	if !shouldSendByLastSent("not-a-date", 24*time.Hour, now) {
		t.Fatalf("expected invalid timestamp to allow sending")
	}

	recent := now.Add(-2 * time.Hour).Format(time.RFC3339)
	if shouldSendByLastSent(recent, 24*time.Hour, now) {
		t.Fatalf("expected recent send timestamp to block sending")
	}

	old := now.Add(-48 * time.Hour).Format(time.RFC3339)
	if !shouldSendByLastSent(old, 24*time.Hour, now) {
		t.Fatalf("expected old send timestamp to allow sending")
	}
}

func TestReminderReferenceTime(t *testing.T) {
	created := time.Date(2026, 2, 1, 9, 0, 0, 0, time.UTC)

	reference := reminderReferenceTime(nil, created)
	if !reference.Equal(created) {
		t.Fatalf("expected created_at as fallback reference time")
	}

	lastActivity := time.Date(2026, 2, 10, 18, 0, 0, 0, time.UTC)
	reference = reminderReferenceTime(&lastActivity, created)
	if !reference.Equal(lastActivity) {
		t.Fatalf("expected last_activity_at to be preferred reference time")
	}
}
