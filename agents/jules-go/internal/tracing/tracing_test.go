package tracing

import (
	"context"
	"testing"
)

func TestDefaultTracerConfig(t *testing.T) {
	cfg := DefaultTracerConfig()

	if cfg.Endpoint != "localhost:4318" {
		t.Errorf("unexpected endpoint: %s", cfg.Endpoint)
	}
	if cfg.ServiceName != "jules-go" {
		t.Errorf("unexpected service name: %s", cfg.ServiceName)
	}
	if cfg.Environment != "development" {
		t.Errorf("unexpected environment: %s", cfg.Environment)
	}
	if !cfg.Enabled {
		t.Error("expected Enabled=true")
	}
}

func TestInitTracer_Disabled(t *testing.T) {
	cfg := DefaultTracerConfig()
	cfg.Enabled = false

	shutdown, err := InitTracer(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Shutdown should be a no-op
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("shutdown returned error: %v", err)
	}
}

func TestTracer(t *testing.T) {
	tracer := Tracer()
	if tracer == nil {
		t.Fatal("expected non-nil tracer")
	}
}

func TestStartSpan(t *testing.T) {
	ctx, span := StartSpan(context.Background(), "test-span")
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
	if span == nil {
		t.Fatal("expected non-nil span")
	}
	span.End()
}

func TestSessionSpan(t *testing.T) {
	ctx, span := SessionSpan(context.Background(), "get", "session-123")
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
	if span == nil {
		t.Fatal("expected non-nil span")
	}
	span.End()
}

func TestRetrySpan(t *testing.T) {
	ctx, span := RetrySpan(context.Background(), 1, "session-123")
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
	if span == nil {
		t.Fatal("expected non-nil span")
	}
	span.End()
}

func TestWebhookSpan(t *testing.T) {
	ctx, span := WebhookSpan(context.Background(), "session.created")
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
	if span == nil {
		t.Fatal("expected non-nil span")
	}
	span.End()
}
