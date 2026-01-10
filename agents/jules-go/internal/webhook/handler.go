package webhook

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"

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
func StartServer(errChan chan<- error) *http.Server {
	listenAddr := ":8090"

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	mux := http.NewServeMux()
	mux.HandleFunc("/webhook/jules", handleWebhook)

	server := &http.Server{
		Addr:    listenAddr,
		Handler: mux,
	}

	go func() {
		slog.Info("webhook server starting", "port", 8090)
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
		Addr:    listenAddr,
		Handler: mux,
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
func handleWebhook(w http.ResponseWriter, r *http.Request) {
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

	// Placeholder for FalkorDB update
	if err := updateFalkorDB(event); err != nil {
		slog.Error("failed to update FalkorDB", "err", err)
		// Depending on requirements, you might want to return a 500 here
	}

	// Placeholder for ntfy notification
	if err := sendNtfyNotification(event); err != nil {
		slog.Error("failed to send ntfy notification", "err", err)
		// Depending on requirements, you might want to return a 500 here
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Webhook received successfully"))
}

// updateFalkorDB is a placeholder function for updating FalkorDB.
func updateFalkorDB(event JulesEvent) error {
	slog.Info("updating FalkorDB", "event_type", event.EventType)
	// TODO: Implement actual FalkorDB update logic here.
	return nil
}

// sendNtfyNotification is a placeholder function for sending ntfy notifications.
func sendNtfyNotification(event JulesEvent) error {
	slog.Info("sending ntfy notification", "event_type", event.EventType)
	// TODO: Implement actual ntfy notification logic here.
	return nil
}
