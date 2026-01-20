package logging

import (
	"context"
	"log/slog"
	"os"
)

type contextKey string

const requestIDKey = contextKey("requestID")

// NewLogger creates a new slog.Logger with the specified level and format.
func NewLogger(level string, format string, component string) *slog.Logger {
	var logLevel slog.Level
	switch level {
	case "debug":
		logLevel = slog.LevelDebug
	case "info":
		logLevel = slog.LevelInfo
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{
		Level: logLevel,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				a.Key = "timestamp"
			}
			return a
		},
	}

	var handler slog.Handler
	switch format {
	case "json":
		handler = slog.NewJSONHandler(os.Stdout, opts)
	case "text":
		handler = slog.NewTextHandler(os.Stdout, opts)
	default:
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	logger := slog.New(handler)
	if component != "" {
		logger = logger.With("component", component)
	}
	return logger
}

// WithRequestID returns a new context with the given request ID.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// FromContext returns a logger from the context, adding the request ID if present.
func FromContext(ctx context.Context) *slog.Logger {
	logger := slog.Default()
	if id, ok := ctx.Value(requestIDKey).(string); ok {
		logger = logger.With("requestID", id)
	}
	return logger
}
