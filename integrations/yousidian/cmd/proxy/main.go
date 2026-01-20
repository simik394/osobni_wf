package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// Config holds the proxy configuration
type Config struct {
	Port          string
	ObsidianHost  string
	ObsidianToken string
}

func main() {
	port := flag.String("port", "8080", "Port to listen on")
	obsidianHost := flag.String("obsidian-host", "https://127.0.0.1:27124", "Obsidian Local REST API URL")
	obsidianToken := flag.String("obsidian-token", "", "Obsidian API Token")
	flag.Parse()

	if *obsidianToken == "" {
		*obsidianToken = os.Getenv("OBSIDIAN_TOKEN")
	}

	if *obsidianToken == "" {
		log.Fatal("OBSIDIAN_TOKEN is required (flag or env)")
	}

	config := Config{
		Port:          *port,
		ObsidianHost:  *obsidianHost,
		ObsidianToken: *obsidianToken,
	}

	// Disable TLS verification for local self-signed certs (Obsidian Local REST API usually uses self-signed)
	http.DefaultTransport.(*http.Transport).TLSClientConfig = &tls.Config{InsecureSkipVerify: true}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	http.HandleFunc("/webhook/youtrack", handleYouTrackWebhook(config))

	log.Printf("Yousidian Proxy listening on :%s", config.Port)
	log.Printf("Targeting Obsidian at %s", config.ObsidianHost)
	log.Fatal(http.ListenAndServe(":"+config.Port, nil))
}

// YouTrackPayload matches the expected JSON from YouTrack Workflow
type YouTrackPayload struct {
	UUID         string `json:"uuid"`
	State        string `json:"state"`
	ResolvedDate int64  `json:"resolvedDate"`
	Summary      string `json:"summary"`
}

func handleYouTrackWebhook(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload YouTrackPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		log.Printf("Received Webhook: UUID=%s State=%s", payload.UUID, payload.State)

		// Forward to Obsidian
		// Logic: PATCH /vault/ Note? Or Search by UUID?
		// The spec says: PATCH /search/ ... but Local REST API might behave differently.
		// If we know the path, we use /vault/{path}.
		// If we only have UUID (Frontmatter), we need to find the file first.

		// 1. Search for file by UUID (using built-in Search or Dataview query via REST API?)
		// Simple approach: GET /search/simple?query=UUID
		// Warning: This depends on plugin capabilities.
		// Let's assume for Phase 1 we just Log it or try a direct patch if path is known.
		// BUT, the payload usually contains UUID.
		// Let's try to search.

		path, err := findNoteByUUID(cfg, payload.UUID)
		if err != nil {
			log.Printf("Error finding note: %v", err)
			http.Error(w, fmt.Sprintf("Note not found: %v", err), http.StatusNotFound)
			return
		}

		// 2. Patch the note
		// PATCH /vault/<path>
		// Header: "Content-Type: application/vnd.olra+json" (Obsidian Local REST API specific)

		// Frontmatter update structure
		/*
			{
				"frontmatter": {
					"status": "...",
					"last_maintenance": "..."
				}
			}
		*/

		patchBody := map[string]interface{}{
			"frontmatter": map[string]interface{}{
				"you_track_status": payload.State,
				"last_updated":     time.Now().Format(time.RFC3339),
			},
		}

		jsonData, _ := json.Marshal(patchBody)

		req, err := http.NewRequest("PATCH", cfg.ObsidianHost+"/vault/"+path, bytes.NewBuffer(jsonData))
		if err != nil {
			http.Error(w, "Failed to create request", http.StatusInternalServerError)
			return
		}

		req.Header.Set("Authorization", "Bearer "+cfg.ObsidianToken)
		req.Header.Set("Content-Type", "application/vnd.olra+json") // Specific merge-patchContentType

		client := &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Failed to patch Obsidian: %v", err)
			http.Error(w, "Failed to patch Obsidian", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			log.Printf("Obsidian API Error (%d): %s", resp.StatusCode, string(body))
			http.Error(w, "Obsidian API Rejected", resp.StatusCode)
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Synced"))
	}
}

func findNoteByUUID(cfg Config, uuid string) (string, error) {
	// GET /search/simple?query="<uuid>"
	// Response: [{ "filename": "...", "path": "...", "score": ... }]

	url := fmt.Sprintf("%s/search/simple?query=\"%s\"", cfg.ObsidianHost, uuid)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+cfg.ObsidianToken)

	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("search failed with status %d", resp.StatusCode)
	}

	var results []struct {
		Filename string  `json:"filename"`
		Path     string  `json:"path"`
		Score    float64 `json:"score"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return "", err
	}

	if len(results) == 0 {
		return "", fmt.Errorf("no results for uuid %s", uuid)
	}

	// Assuming best match is first
	return results[0].Path, nil
}
