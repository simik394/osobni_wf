package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// MockObsidianHandler simulates the Obsidian Local REST API
func MockObsidianHandler(t *testing.T) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Mock Search
		if r.URL.Path == "/search/simple" {
			query := r.URL.Query().Get("query")
			if query == "\"uuid-123\"" {
				w.WriteHeader(http.StatusOK)
				// Respond with a mock search result
				w.Write([]byte(`[{"filename": "Task 1", "path": "path/to/Task 1.md", "score": 1.0}]`))
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`[]`)) // Not found
			return
		}

		// Mock Patch
		if r.Method == "PATCH" && r.URL.Path == "/vault/path/to/Task 1.md" {
			// Verify Content-Type
			if r.Header.Get("Content-Type") != "application/vnd.olra+json" {
				t.Errorf("Expected Content-Type application/vnd.olra+json, got %s", r.Header.Get("Content-Type"))
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusOK)
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}
}

func TestHandleYouTrackWebhook(t *testing.T) {
	// 1. Setup Mock Obsidian Server
	mockObsidian := httptest.NewServer(MockObsidianHandler(t))
	defer mockObsidian.Close()

	// 2. Configure Proxy to use Mock Server
	cfg := Config{
		Port:          "8080",
		ObsidianHost:  mockObsidian.URL,
		ObsidianToken: "test-token",
	}

	// 3. Create Webhook Payload
	payload := YouTrackPayload{
		UUID:    "uuid-123",
		State:   "In Progress",
		Summary: "Test Task",
	}
	body, _ := json.Marshal(payload)

	// 4. Send Request to Proxy Handler
	req, _ := http.NewRequest("POST", "/webhook/youtrack", bytes.NewBuffer(body))
	w := httptest.NewRecorder()

	handler := handleYouTrackWebhook(cfg)
	handler.ServeHTTP(w, req)

	// 5. Assertions
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
		t.Logf("Response body: %s", w.Body.String())
	}
}

func TestFindNoteByUUID(t *testing.T) {
	mockObsidian := httptest.NewServer(MockObsidianHandler(t))
	defer mockObsidian.Close()

	cfg := Config{
		ObsidianHost:  mockObsidian.URL,
		ObsidianToken: "test-token",
	}

	// Test Found
	path, err := findNoteByUUID(cfg, "uuid-123")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if path != "path/to/Task 1.md" {
		t.Errorf("Expected path 'path/to/Task 1.md', got '%s'", path)
	}

	// Test Not Found
	_, err = findNoteByUUID(cfg, "uuid-999")
	if err == nil {
		t.Error("Expected error for non-existent UUID, got nil")
	}
}
