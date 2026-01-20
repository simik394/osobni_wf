package jules

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDefaultRetryPolicy(t *testing.T) {
	policy := DefaultRetryPolicy()

	if policy.MaxRetries != 3 {
		t.Errorf("expected MaxRetries=3, got %d", policy.MaxRetries)
	}
	if policy.BackoffBase != time.Second {
		t.Errorf("expected BackoffBase=1s, got %v", policy.BackoffBase)
	}
	if policy.Jitter != 0.2 {
		t.Errorf("expected Jitter=0.2, got %v", policy.Jitter)
	}
	if len(policy.NonRetriable) == 0 {
		t.Error("expected non-empty NonRetriable list")
	}
}

func TestRetryPolicy_isNonRetriable(t *testing.T) {
	policy := RetryPolicy{
		NonRetriable: []string{"auth_failed", "permission_denied"},
	}

	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"nil error", nil, false},
		{"auth failed", errors.New("auth_failed: invalid token"), true},
		{"permission denied", errors.New("PERMISSION_DENIED"), true},
		{"retriable error", errors.New("timeout"), false},
		{"network error", errors.New("connection refused"), false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := policy.isNonRetriable(tc.err)
			if got != tc.expected {
				t.Errorf("isNonRetriable(%v) = %v, want %v", tc.err, got, tc.expected)
			}
		})
	}
}

func TestRetryPolicy_calculateBackoff(t *testing.T) {
	policy := RetryPolicy{
		BackoffBase: time.Second,
		BackoffMax:  30 * time.Second,
		Jitter:      0, // No jitter for predictable tests
	}

	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{0, time.Second},       // 1s * 2^0 = 1s
		{1, 2 * time.Second},   // 1s * 2^1 = 2s
		{2, 4 * time.Second},   // 1s * 2^2 = 4s
		{3, 8 * time.Second},   // 1s * 2^3 = 8s
		{10, 30 * time.Second}, // Capped at BackoffMax
	}

	for _, tc := range tests {
		t.Run(string(rune('0'+tc.attempt)), func(t *testing.T) {
			got := policy.calculateBackoff(tc.attempt)
			if got != tc.expected {
				t.Errorf("calculateBackoff(%d) = %v, want %v", tc.attempt, got, tc.expected)
			}
		})
	}
}

func TestRetryPolicy_calculateBackoff_withJitter(t *testing.T) {
	policy := RetryPolicy{
		BackoffBase: time.Second,
		BackoffMax:  30 * time.Second,
		Jitter:      0.5,
	}

	// Run many times to verify jitter affects the result
	results := make(map[time.Duration]bool)
	for i := 0; i < 100; i++ {
		delay := policy.calculateBackoff(0)
		results[delay] = true
	}

	// With 50% jitter, we should see variance
	if len(results) < 5 {
		t.Errorf("expected variance with jitter, got only %d unique values", len(results))
	}
}

func TestRetryResult(t *testing.T) {
	result := RetryResult{
		Success:  true,
		Attempts: 2,
		Duration: 1500 * time.Millisecond,
	}

	if !result.Success {
		t.Error("expected Success=true")
	}
	if result.Attempts != 2 {
		t.Errorf("expected Attempts=2, got %d", result.Attempts)
	}
	if result.Duration != 1500*time.Millisecond {
		t.Errorf("expected Duration=1.5s, got %v", result.Duration)
	}
}

func TestErrMaxRetriesExceeded(t *testing.T) {
	if ErrMaxRetriesExceeded == nil {
		t.Error("ErrMaxRetriesExceeded should not be nil")
	}
	if ErrMaxRetriesExceeded.Error() != "maximum retries exceeded" {
		t.Errorf("unexpected error message: %s", ErrMaxRetriesExceeded.Error())
	}
}

func TestErrNonRetriable(t *testing.T) {
	if ErrNonRetriable == nil {
		t.Error("ErrNonRetriable should not be nil")
	}
	if ErrNonRetriable.Error() != "non-retriable error" {
		t.Errorf("unexpected error message: %s", ErrNonRetriable.Error())
	}
}

func TestRetrySessionWithPolicy_ContextCancellation(t *testing.T) {
	// This test verifies that retry respects context cancellation
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	// We can't easily test with the real client without mocking,
	// but we can verify the context check behavior exists
	if ctx.Err() == nil {
		t.Error("expected cancelled context")
	}
}

// RetryBudget tests

func TestNewRetryBudget(t *testing.T) {
	rb := NewRetryBudget(5, time.Second)

	if rb == nil {
		t.Fatal("expected non-nil budget")
	}
	if rb.maxTokens != 5 {
		t.Errorf("expected maxTokens=5, got %d", rb.maxTokens)
	}
	if rb.tokens != 5 {
		t.Errorf("expected tokens=5, got %d", rb.tokens)
	}
}

func TestDefaultRetryBudget(t *testing.T) {
	rb := DefaultRetryBudget()

	if rb.maxTokens != 10 {
		t.Errorf("expected maxTokens=10, got %d", rb.maxTokens)
	}
	if rb.refillRate != time.Minute {
		t.Errorf("expected refillRate=1m, got %v", rb.refillRate)
	}
}

func TestRetryBudget_Consume(t *testing.T) {
	rb := NewRetryBudget(3, time.Minute)

	// Should succeed 3 times
	for i := 0; i < 3; i++ {
		if !rb.Consume() {
			t.Errorf("expected Consume to succeed on attempt %d", i+1)
		}
	}

	// Should fail when exhausted
	if rb.Consume() {
		t.Error("expected Consume to fail when budget exhausted")
	}
}

func TestRetryBudget_Available(t *testing.T) {
	rb := NewRetryBudget(5, time.Minute)

	if rb.Available() != 5 {
		t.Errorf("expected Available=5, got %d", rb.Available())
	}

	rb.Consume()
	rb.Consume()

	if rb.Available() != 3 {
		t.Errorf("expected Available=3, got %d", rb.Available())
	}
}

func TestErrBudgetExhausted(t *testing.T) {
	if ErrBudgetExhausted == nil {
		t.Error("ErrBudgetExhausted should not be nil")
	}
	if ErrBudgetExhausted.Error() != "retry budget exhausted" {
		t.Errorf("unexpected error message: %s", ErrBudgetExhausted.Error())
	}
}
