package webhook

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
)

// JulesEvent represents the structure of the incoming webhook event.
type JulesEvent struct {
	EventType string `json:"event_type"`
	Data      struct {
		Message string `json:"message"`
	} `json:"data"`
}

// StartServer initializes and starts the HTTP server.
func StartServer() {
	listenAddr := ":8090"

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	http.HandleFunc("/webhook/jules", handleWebhook)

	slog.Info("server starting", "port", 8090)
	if err := http.ListenAndServe(listenAddr, nil); err != nil {
		slog.Error("server failed to start", "err", err)
	}
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
