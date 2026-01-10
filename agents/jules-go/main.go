package main

import (
	"context"
	"fmt"
	"jules-go/internal/config"
	"jules-go/internal/notify"
	"jules-go/internal/session"
	"log"
)

func main() {
	// Load the configuration
	cfg, err := config.Load("config.yaml")
	if err != nil {
		log.Fatalf("failed to load configuration: %v", err)
	}

	// Initialize the ntfy client
	ntfyClient := notify.NewNtfyClient(cfg.Ntfy.ServerURL, cfg.Ntfy.Topic)

	// Initialize the session manager
	sessionManager := session.NewManager(ntfyClient)

	// Create a new session to trigger a notification
	newSession, err := sessionManager.CreateSession("example_task")
	if err != nil {
		log.Fatalf("failed to create session: %v", err)
	}

	fmt.Printf("New session created: %s\n", newSession.ID)

	// Update the session status to trigger another notification
	err = sessionManager.UpdateSessionStatus(newSession.ID, session.StatusCompleted)
	if err != nil {
		log.Fatalf("failed to update session status: %v", err)
	}

	fmt.Printf("Session %s completed\n", newSession.ID)

	// You can also use the client to send a custom notification
	err = ntfyClient.Send(context.Background(), "Custom Notification", "This is a custom message", "high")
	if err != nil {
		log.Fatalf("failed to send custom notification: %v", err)
	}

	fmt.Println("Custom notification sent")
}
