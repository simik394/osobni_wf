package main

import (
	"context"
	"jules-go/internal/config"
	"jules-go/internal/shutdown"
	"jules-go/internal/webhook"
	"log/slog"
	"os"
	"time"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// Load configuration
	cfg, err := config.Load("config.yaml")
	if err != nil {
		slog.Error("failed to load configuration", "err", err)
		os.Exit(1)
	}

	shutdownManager := shutdown.NewManager(30 * time.Second)

	errChan := make(chan error, 1)
	server := webhook.StartServer(cfg, errChan)
	if server == nil {
		slog.Error("failed to start webhook server")
		os.Exit(1)
	}
	shutdownManager.Add(func(ctx context.Context) error {
		slog.Info("shutting down HTTP server")
		return server.Shutdown(ctx)
	})

	go func() {
		shutdownManager.Wait()
		close(errChan)
	}()

	slog.Info("application started")

	if err, ok := <-errChan; ok && err != nil {
		slog.Error("application error", "err", err)
	}
	slog.Info("application stopped")
}
