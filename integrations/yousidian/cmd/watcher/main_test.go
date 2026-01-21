package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestParseFrontmatter(t *testing.T) {
	content := []byte(`---
youtrack_id: YT-123
status: In Progress
title: My Task
---
# Content here`)

	fm, err := parseFrontmatter(content)
	if err != nil {
		t.Fatalf("Failed to parse frontmatter: %v", err)
	}

	if fm.YouTrackID != "YT-123" {
		t.Errorf("Expected YT-123, got %s", fm.YouTrackID)
	}
	if fm.Status != "In Progress" {
		t.Errorf("Expected In Progress, got %s", fm.Status)
	}
}

func TestUpdateYouTrackIssue(t *testing.T) {
	// Mock YouTrack Server
	mockYT := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/api/issues/YT-123" {
			t.Errorf("Expected /api/issues/YT-123, got %s", r.URL.Path)
		}

		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)

		if body["summary"] != "My Task" {
			t.Errorf("Expected summary 'My Task', got %v", body["summary"])
		}

		fields := body["customFields"].([]interface{})
		stateField := fields[0].(map[string]interface{})
		if stateField["name"] != "State" {
			t.Errorf("Expected custom field 'State'")
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer mockYT.Close()

	cfg := Config{
		YouTrackHost:  mockYT.URL,
		YouTrackToken: "token",
	}

	fm := Frontmatter{
		YouTrackID: "YT-123",
		Status:     "In Progress",
		Title:      "My Task",
	}

	if err := updateYouTrackIssue(cfg, fm); err != nil {
		t.Errorf("Update failed: %v", err)
	}
}

func TestProcessFile_Integration(t *testing.T) {
	// Create a temp file
	tmpFile, err := os.CreateTemp("", "test_note_*.md")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpFile.Name())

	content := []byte(`---
youtrack_id: YT-999
status: Done
title: Integration Test
---
`)
	if _, err := tmpFile.Write(content); err != nil {
		t.Fatal(err)
	}
	tmpFile.Close()

	// Mock YouTrack
	mockYT := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/issues/YT-999" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockYT.Close()

	cfg := Config{
		YouTrackHost:  mockYT.URL,
		YouTrackToken: "token",
	}

	// Direct call to processFile (bypassing watcher loop for unit test)
	// We capture logs or just ensure no panic/error printed
	// Since processFile logs errors but doesn't return them, we rely on the http handler assertion or simple coverage.
	// For better testing, processFile could return error.

	processFile(cfg, tmpFile.Name())

	// Wait a bit? No, it's synchronous.
}
