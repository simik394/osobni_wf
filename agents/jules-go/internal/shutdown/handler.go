package shutdown

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// ShutdownManager coordinates the graceful shutdown of application components.
type ShutdownManager struct {
	shutdownTimeout time.Duration
	closers         []func(ctx context.Context) error
}

// NewManager creates a new ShutdownManager.
func NewManager(shutdownTimeout time.Duration) *ShutdownManager {
	if shutdownTimeout == 0 {
		shutdownTimeout = 30 * time.Second
	}
	return &ShutdownManager{
		shutdownTimeout: shutdownTimeout,
	}
}

// Add adds a new cleanup function to the manager.
func (sm *ShutdownManager) Add(closer func(ctx context.Context) error) {
	sm.closers = append(sm.closers, closer)
}

// Wait blocks until a shutdown signal is received, then gracefully shuts down the application.
func (sm *ShutdownManager) Wait() {
	// Create a channel to receive OS signals.
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Block until a signal is received.
	sig := <-sigChan
	slog.Info("shutdown signal received", "signal", sig)

	// Create a context with a timeout for the shutdown process.
	ctx, cancel := context.WithTimeout(context.Background(), sm.shutdownTimeout)
	defer cancel()

	// Call all cleanup functions in reverse order.
	for i := len(sm.closers) - 1; i >= 0; i-- {
		closer := sm.closers[i]
		if err := closer(ctx); err != nil {
			slog.Error("shutdown error", "err", err)
		}
	}
	slog.Info("shutdown complete")
}
