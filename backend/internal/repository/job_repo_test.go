package repository

import "testing"

func TestUpdateStatusSetsCompletedAt_Completed(t *testing.T) {
	if !updateStatusSetsCompletedAt("completed") {
		t.Fatalf("expected completed to set completed_at")
	}
}

func TestUpdateStatusSetsCompletedAt_Failed(t *testing.T) {
	if !updateStatusSetsCompletedAt("failed") {
		t.Fatalf("expected failed to set completed_at")
	}
}

func TestUpdateStatusSetsCompletedAt_Cancelled(t *testing.T) {
	if !updateStatusSetsCompletedAt("cancelled") {
		t.Fatalf("expected cancelled to set completed_at")
	}
}

func TestUpdateStatusSetsCompletedAt_Processing(t *testing.T) {
	if updateStatusSetsCompletedAt("processing") {
		t.Fatalf("expected processing to not set completed_at")
	}
}
