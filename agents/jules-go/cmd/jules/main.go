package main

import (
	"context"
	"jules-go/internal/db"
	"jules-go/internal/shutdown"
	"jules-go/internal/webhook"
	"log/slog"
	"os"
	"time"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	shutdownManager := shutdown.NewManager(30 * time.Second)

	dbClient, err := db.NewClient(context.Background(), "localhost:6379")
	if err != nil {
		slog.Error("failed to connect to FalkorDB", "err", err)
		os.Exit(1)
	}
	shutdownManager.Add(func(ctx context.Context) error {
		slog.Info("closing FalkorDB connection")
		return dbClient.Close()
	})

	errChan := make(chan error, 1)
	server := webhook.StartServer(errChan)
	shutdownManager.Add(func(ctx context.Context) error {
		slog.Info("shutting down HTTP server")
		return server.Shutdown(ctx)
	})

	go func() {
		shutdownManager.Wait()
		close(errChan)
	}()

	slog.Info("application started")

	if err := <-errChan; err != nil {
		slog.Error("application error", "err", err)
	}
	slog.Info("application stopped")
}
