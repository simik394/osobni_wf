package tracing

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

const (
	serviceName    = "jules-go"
	serviceVersion = "1.0.0"
)

// TracerConfig holds configuration for the OpenTelemetry tracer.
type TracerConfig struct {
	Endpoint    string
	ServiceName string
	Environment string
	Enabled     bool
}

// DefaultTracerConfig returns sensible defaults.
func DefaultTracerConfig() TracerConfig {
	return TracerConfig{
		Endpoint:    "localhost:4318",
		ServiceName: serviceName,
		Environment: "development",
		Enabled:     true,
	}
}

// InitTracer initializes the OpenTelemetry tracer provider.
func InitTracer(ctx context.Context, cfg TracerConfig) (func(context.Context) error, error) {
	if !cfg.Enabled {
		return func(context.Context) error { return nil }, nil
	}

	client := otlptracehttp.NewClient(
		otlptracehttp.WithEndpoint(cfg.Endpoint),
		otlptracehttp.WithInsecure(),
	)

	exporter, err := otlptrace.New(ctx, client)
	if err != nil {
		return nil, fmt.Errorf("failed to create OTLP exporter: %w", err)
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(serviceVersion),
			attribute.String("environment", cfg.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	return tp.Shutdown, nil
}

// Tracer returns the default tracer for jules-go.
func Tracer() trace.Tracer {
	return otel.Tracer(serviceName)
}

// StartSpan creates a new span with the given name and attributes.
func StartSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	return Tracer().Start(ctx, name, trace.WithAttributes(attrs...))
}

// SessionSpan creates a span for session operations.
func SessionSpan(ctx context.Context, operation, sessionID string) (context.Context, trace.Span) {
	return StartSpan(ctx, fmt.Sprintf("session.%s", operation),
		attribute.String("session.id", sessionID),
		attribute.String("session.operation", operation),
	)
}

// RetrySpan creates a span for retry operations.
func RetrySpan(ctx context.Context, attempt int, sessionID string) (context.Context, trace.Span) {
	return StartSpan(ctx, "retry.attempt",
		attribute.Int("retry.attempt", attempt),
		attribute.String("session.id", sessionID),
	)
}

// WebhookSpan creates a span for webhook handling.
func WebhookSpan(ctx context.Context, eventType string) (context.Context, trace.Span) {
	return StartSpan(ctx, "webhook.handle",
		attribute.String("webhook.event_type", eventType),
	)
}
