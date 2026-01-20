package jules

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"
)

func TestNewSupervisor(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg := DefaultSupervisorConfig()

	// Create supervisor without real client (nil is ok for unit test)
	s := NewSupervisor(nil, logger, cfg)

	if s == nil {
		t.Fatal("expected non-nil supervisor")
	}
	if s.pollInterval != cfg.PollInterval {
		t.Errorf("poll interval mismatch: got %v, want %v", s.pollInterval, cfg.PollInterval)
	}
	if s.maxRetries != cfg.MaxRetries {
		t.Errorf("max retries mismatch: got %d, want %d", s.maxRetries, cfg.MaxRetries)
	}
}

func TestDefaultSupervisorConfig(t *testing.T) {
	cfg := DefaultSupervisorConfig()

	if cfg.PollInterval != 30*time.Second {
		t.Errorf("unexpected poll interval: %v", cfg.PollInterval)
	}
	if cfg.MaxRetries != 3 {
		t.Errorf("unexpected max retries: %d", cfg.MaxRetries)
	}
	if cfg.BufferSize != 100 {
		t.Errorf("unexpected buffer size: %d", cfg.BufferSize)
	}
}

func TestSupervisor_SubmitTask(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg := DefaultSupervisorConfig()
	s := NewSupervisor(nil, logger, cfg)

	task := Task{
		SessionID:   "test-session-123",
		Description: "Test task",
	}

	// Submit should not block
	done := make(chan struct{})
	go func() {
		s.Submit(task)
		close(done)
	}()

	select {
	case <-done:
		// Success
	case <-time.After(time.Second):
		t.Fatal("Submit blocked")
	}
}

func TestSupervisor_StartStop(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg := SupervisorConfig{
		PollInterval: 100 * time.Millisecond,
		MaxRetries:   1,
		BufferSize:   10,
	}
	s := NewSupervisor(nil, logger, cfg)

	ctx := context.Background()
	s.Start(ctx)

	// Let it run briefly
	time.Sleep(50 * time.Millisecond)

	// Stop should not hang
	done := make(chan struct{})
	go func() {
		s.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Success
	case <-time.After(time.Second):
		t.Fatal("Stop hung")
	}
}

func TestSuggestFix(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg := DefaultSupervisorConfig()
	s := NewSupervisor(nil, logger, cfg)

	tests := []struct {
		name     string
		errStr   string
		contains string
	}{
		{"rate limit", "rate limit exceeded", "rate limit"},
		{"context length", "context length too long", "Trim"},
		{"timeout", "request timeout", "timeout"},
		{"auth", "authentication failed", "API key"},
		{"unknown", "some random error", "investigation"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := Task{SessionID: "test"}
			fix := s.suggestFix(task, &testError{msg: tt.errStr})
			if !containsString(fix, tt.contains) {
				t.Errorf("fix %q should contain %q", fix, tt.contains)
			}
		})
	}
}

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}

func containsString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
