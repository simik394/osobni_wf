package jules

import (
	"context"
	"testing"
)

func TestNewSessionDebugger(t *testing.T) {
	d := NewSessionDebugger(nil)
	if d == nil {
		t.Fatal("expected non-nil debugger")
	}
}

func TestMatchPattern(t *testing.T) {
	d := NewSessionDebugger(nil)

	tests := []struct {
		error    string
		category string
	}{
		{"rate limit exceeded", "throttling"},
		{"context length too long", "resource"},
		{"request timeout", "network"},
		{"authentication failed", "security"},
		{"invalid json payload", "data"},
		{"resource not found", "resource"},
		{"permission denied", "security"},
		{"internal server error", "backend"},
		{"some unknown error", ""},
	}

	for _, tt := range tests {
		t.Run(tt.error, func(t *testing.T) {
			pattern := d.matchPattern(tt.error)
			if tt.category == "" {
				if pattern != nil {
					t.Errorf("expected nil pattern for unknown error, got %v", pattern)
				}
			} else {
				if pattern == nil {
					t.Fatalf("expected pattern for %q", tt.error)
				}
				if pattern.Category != tt.category {
					t.Errorf("expected category %q, got %q", tt.category, pattern.Category)
				}
			}
		})
	}
}

func TestGenerateHypothesis(t *testing.T) {
	d := NewSessionDebugger(nil)

	// Empty activities
	hyp := d.generateHypothesis([]*Activity{}, "some error")
	if hyp == "" {
		t.Error("expected non-empty hypothesis")
	}

	// With activities
	activities := []*Activity{
		{ID: "1", Description: "Started task"},
		{ID: "2", Description: "Writing code"},
	}
	hyp = d.generateHypothesis(activities, "failed")
	if hyp == "" {
		t.Error("expected non-empty hypothesis with activities")
	}
}

func TestDebugContext(t *testing.T) {
	dc := DebugContext{
		SessionID:  "test-123",
		ErrorTrace: "test error",
	}
	if dc.SessionID != "test-123" {
		t.Errorf("unexpected session ID: %s", dc.SessionID)
	}
}

func TestAnalyzeFailure_NoClient(t *testing.T) {
	d := NewSessionDebugger(nil)

	// Should not panic with nil client
	dc, err := d.AnalyzeFailure(context.Background(), "session-1", "rate limit exceeded")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dc == nil {
		t.Fatal("expected non-nil debug context")
	}
	if dc.Hypothesis == "" {
		t.Error("expected non-empty hypothesis")
	}
}

func TestFailurePatternSeverities(t *testing.T) {
	for _, p := range knownPatterns {
		if p.Severity == "" {
			t.Errorf("pattern %q has empty severity", p.Pattern)
		}
		if p.Fix == "" {
			t.Errorf("pattern %q has empty fix", p.Pattern)
		}
	}
}
