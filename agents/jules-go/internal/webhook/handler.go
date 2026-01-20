package webhook

import (
	"context"
	"encoding/json"
	"fmt"
	"jules-go/internal/config"
	"jules-go/internal/db"
	"jules-go/internal/notify"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// JulesEvent represents the structure of the incoming webhook event.
type JulesEvent struct {
	EventType string `json:"event_type"`
	Data      struct {
		Message string `json:"message"`
	} `json:"data"`
}

// StartServer initializes and starts the HTTP server for webhooks.
// It supports graceful shutdown by returning the server instance.
func StartServer(cfg *config.Config, errChan chan<- error) *http.Server {
	listenAddr := fmt.Sprintf(":%d", cfg.WebhookPort)

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// Initialize FalkorDB client
	dbClient, err := db.NewClient(context.Background(), cfg.FalkorDBURL)
	if err != nil {
		slog.Error("failed to create FalkorDB client", "err", err)
		errChan <- err
		return nil
	}

	// Initialize ntfy client
	ntfyClient := notify.NewNtfyClient(cfg.Ntfy.ServerURL, cfg.Ntfy.Topic)

	mux := http.NewServeMux()
	mux.HandleFunc("/webhook/jules", handleWebhook(dbClient, ntfyClient))

	server := &http.Server{
		Addr:         listenAddr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("webhook server starting", "port", cfg.WebhookPort)
		err := server.ListenAndServe()
		if err != nil && err != http.ErrServerClosed {
			slog.Error("webhook server failed to start", "err", err)
			errChan <- err
		}
		close(errChan)
	}()

	return server
}

// StartMetricsServer initializes and starts the HTTP server for Prometheus metrics.
// It returns a server instance for graceful shutdown support.
func StartMetricsServer(port int, errChan chan<- error) *http.Server {
	listenAddr := fmt.Sprintf(":%d", port)

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	server := &http.Server{
		Addr:         listenAddr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("metrics server starting", "port", port)
		err := server.ListenAndServe()
		if err != nil && err != http.ErrServerClosed {
			slog.Error("metrics server failed to start", "err", err)
			errChan <- err
		}
	}()

	return server
}

// handleWebhook processes incoming POST requests to the /webhook/jules endpoint.
func handleWebhook(dbClient *db.Client, ntfyClient *notify.NtfyClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
			return
		}
		defer r.Body.Close()

		var event JulesEvent
		decoder := json.NewDecoder(r.Body)
		if err := decoder.Decode(&event); err != nil {
			slog.Error("failed to decode webhook event", "err", err)
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		slog.Info("webhook event received", "event_type", event.EventType, "data", event.Data)

		ctx := r.Context()

		// Placeholder for FalkorDB update
		if err := updateFalkorDB(ctx, dbClient, event); err != nil {
			slog.Error("failed to update FalkorDB", "err", err)
			// Depending on requirements, you might want to return a 500 here
		}

		// Placeholder for ntfy notification
		if err := sendNtfyNotification(ctx, ntfyClient, event); err != nil {
			slog.Error("failed to send ntfy notification", "err", err)
			// Depending on requirements, you might want to return a 500 here
		}

		w.WriteHeader(http.StatusOK)
		if _, err := w.Write([]byte("Webhook received successfully")); err != nil {
			slog.Error("failed to write response", "err", err)
		}
	}
}

// updateFalkorDB persists the webhook event to FalkorDB.
func updateFalkorDB(ctx context.Context, client *db.Client, event JulesEvent) error {
	slog.Info("updating FalkorDB", "event_type", event.EventType)

	sessionID := uuid.New().String()

	session := &db.JulesSession{
		ID:     sessionID,
		Status: "received",
		// The Repo field is left empty as the event payload does not yet contain this information.
		// This will be updated as the event schema evolves.
		Repo:      "",
		Task:      event.EventType,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := client.CreateJulesSession(ctx, session); err != nil {
		return fmt.Errorf("failed to create jules session in falkordb: %w", err)
	}

	slog.Info("successfully created session in FalkorDB", "session_id", sessionID)
	return nil
}

// sendNtfyNotification sends a notification using the ntfy client.
func sendNtfyNotification(ctx context.Context, client *notify.NtfyClient, event JulesEvent) error {
	slog.Info("sending ntfy notification", "event_type", event.EventType)

	title := fmt.Sprintf("Jules Event: %s", event.EventType)
	message := event.Data.Message

	if err := client.Send(ctx, title, message, notify.PriorityDefault); err != nil {
		return fmt.Errorf("failed to send ntfy notification: %w", err)
	}

	slog.Info("successfully sent ntfy notification", "event_type", event.EventType)
	return nil
}
