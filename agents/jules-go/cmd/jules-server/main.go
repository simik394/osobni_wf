package main

import (
	"context"
	"jules-go/internal/config"
	"jules-go/internal/db"
	"jules-go/internal/logging"
	"jules-go/internal/shutdown"
	"jules-go/internal/webhook"
	"log/slog"
	"net/http"
)

func main() {
	// Initialize logger
	logger := logging.NewLogger("info", "json", "jules-server")
	slog.SetDefault(logger)

	// Load configuration
	cfg, err := config.Load("config.yaml")
	if err != nil {
		slog.Error("failed to load configuration", "err", err)
		return
	}

	// Initialize shutdown manager
	shutdownManager := shutdown.NewManager(cfg.ShutdownTimeout)

	// Initialize database client
	dbClient, err := db.NewClient(context.Background(), cfg.FalkorDB.Addr)
	if err != nil {
		slog.Error("failed to connect to FalkorDB", "err", err)
		return
	}
	shutdownManager.Add(func(ctx context.Context) error {
		slog.Info("closing FalkorDB connection")
		return dbClient.Close()
	})

	// Start servers
	webhookErrChan := make(chan error, 1)
	webhookServer := webhook.StartServer(cfg, webhookErrChan)
	shutdownManager.Add(func(ctx context.Context) error {
		slog.Info("shutting down webhook server")
		return webhookServer.Shutdown(ctx)
	})

	metricsErrChan := make(chan error, 1)
	metricsServer := webhook.StartMetricsServer(cfg.MetricsPort, metricsErrChan)
	shutdownManager.Add(func(ctx context.Context) error {
		slog.Info("shutting down metrics server")
		return metricsServer.Shutdown(ctx)
	})

	// Wait for shutdown signal
	go func() {
		select {
		case err := <-webhookErrChan:
			if err != nil && err != http.ErrServerClosed {
				slog.Error("webhook server error", "err", err)
			}
		case err := <-metricsErrChan:
			if err != nil && err != http.ErrServerClosed {
				slog.Error("metrics server error", "err", err)
			}
		}
	}()

	shutdownManager.Wait()
}
