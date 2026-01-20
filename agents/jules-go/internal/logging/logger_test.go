package logging

import (
	"context"
	"testing"
)

func TestNewLogger(t *testing.T) {
	tests := []struct {
		name      string
		level     string
		format    string
		component string
	}{
		{"debug level text format", "debug", "text", "test-component"},
		{"info level json format", "info", "json", "api"},
		{"warn level text format", "warn", "text", ""},
		{"error level json format", "error", "json", "worker"},
		{"default level on unknown", "unknown", "text", "test"},
		{"default format on unknown", "info", "unknown", "test"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger := NewLogger(tt.level, tt.format, tt.component)
			if logger == nil {
				t.Error("expected logger, got nil")
			}
		})
	}
}

func TestWithRequestID(t *testing.T) {
	ctx := context.Background()
	id := "test-request-123"

	newCtx := WithRequestID(ctx, id)
	if newCtx == nil {
		t.Fatal("expected context, got nil")
	}

	// Verify the context is different from the original
	if newCtx == ctx {
		t.Error("expected new context, got same context")
	}
}

func TestFromContext(t *testing.T) {
	t.Run("without request ID", func(t *testing.T) {
		ctx := context.Background()
		logger := FromContext(ctx)
		if logger == nil {
			t.Error("expected logger, got nil")
		}
	})

	t.Run("with request ID", func(t *testing.T) {
		ctx := WithRequestID(context.Background(), "req-456")
		logger := FromContext(ctx)
		if logger == nil {
			t.Error("expected logger, got nil")
		}
	})
}
