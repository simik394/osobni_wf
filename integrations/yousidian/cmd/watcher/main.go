package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"gopkg.in/yaml.v3"
)

// Config holds the watcher configuration
type Config struct {
	VaultPath     string
	YouTrackHost  string
	YouTrackToken string
}

// Frontmatter represents the metadata we care about
type Frontmatter struct {
	YouTrackID string `yaml:"youtrack_id"`
	Status     string `yaml:"status"`
	Title      string `yaml:"title"` // Sometimes title is in frontmatter, or we use filename
}

func main() {
	vaultPath := flag.String("vault", "", "Path to Obsidian Vault to watch")
	ytHost := flag.String("youtrack-host", "", "YouTrack Base URL (e.g., https://myorg.youtrack.cloud)")
	ytToken := flag.String("youtrack-token", "", "YouTrack Permanent Token")
	flag.Parse()

	if *vaultPath == "" {
		*vaultPath = os.Getenv("OBSIDIAN_VAULT_PATH")
	}
	if *ytHost == "" {
		*ytHost = os.Getenv("YOUTRACK_HOST")
	}
	if *ytToken == "" {
		*ytToken = os.Getenv("YOUTRACK_TOKEN")
	}

	if *vaultPath == "" || *ytHost == "" || *ytToken == "" {
		log.Fatal("Missing required flags: -vault, -youtrack-host, -youtrack-token (or env vars)")
	}

	config := Config{
		VaultPath:     *vaultPath,
		YouTrackHost:  strings.TrimRight(*ytHost, "/"),
		YouTrackToken: *ytToken,
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	defer watcher.Close()

	// Recursively add directories to watcher
	if err := filepath.Walk(config.VaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			// Skip .git or .obsidian folders
			if strings.Contains(path, "/.") {
				return filepath.SkipDir
			}
			return watcher.Add(path)
		}
		return nil
	}); err != nil {
		log.Fatal(err)
	}

	log.Printf("Watching vault at %s for changes...", config.VaultPath)

	var (
		timer     *time.Timer
		mu        sync.Mutex
		debounce  = 500 * time.Millisecond
		lastEvent fsnotify.Event
	)

	done := make(chan bool)
	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}

				if event.Op&fsnotify.Write == fsnotify.Write {
					if !strings.HasSuffix(event.Name, ".md") {
						continue
					}

					mu.Lock()
					lastEvent = event
					if timer != nil {
						timer.Stop()
					}
					timer = time.AfterFunc(debounce, func() {
						mu.Lock()
						evt := lastEvent
						mu.Unlock()

						log.Printf("File modified: %s", evt.Name)
						processFile(config, evt.Name)
					})
					mu.Unlock()
				}
				// Handle new directories
				if event.Op&fsnotify.Create == fsnotify.Create {
					info, err := os.Stat(event.Name)
					if err == nil && info.IsDir() {
						watcher.Add(event.Name)
					}
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			}
		}
	}()

	<-done
}

func processFile(cfg Config, filepath string) {
	content, err := os.ReadFile(filepath)
	if err != nil {
		log.Printf("Error reading file: %v", err)
		return
	}

	fm, err := parseFrontmatter(content)
	if err != nil {
		// Might not have frontmatter, skip
		return
	}

	if fm.YouTrackID == "" {
		return // Not a YouTrack linked note
	}

	log.Printf("Syncing %s (ID: %s) to YouTrack...", filepath, fm.YouTrackID)
	if err := updateYouTrackIssue(cfg, fm); err != nil {
		log.Printf("Failed to sync to YouTrack: %v", err)
	} else {
		log.Printf("Successfully synced %s", fm.YouTrackID)
	}
}

func parseFrontmatter(content []byte) (Frontmatter, error) {
	// Robust Frontmatter extraction
	// Handles \r\n and whitespace variations
	re := regexp.MustCompile(`(?s)^---\s*\r?\n(.+?)\r?\n---`)
	matches := re.FindSubmatch(content)
	if len(matches) < 2 {
		return Frontmatter{}, fmt.Errorf("no frontmatter found")
	}

	var fm Frontmatter
	err := yaml.Unmarshal(matches[1], &fm)
	return fm, err
}

func updateYouTrackIssue(cfg Config, fm Frontmatter) error {
	// API: POST /api/issues/{id}
	// Payload: { "summary": "...", "customFields": [...] }

	payload := map[string]interface{}{
		"summary": fm.Title,
	}

	if fm.Status != "" {
		payload["customFields"] = []map[string]interface{}{
			{
				"name": "State",
				"$type": "SingleEnumIssueCustomField",
				"value": map[string]interface{}{
					"name": fm.Status,
				},
			},
		}
	}

	jsonData, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/api/issues/%s", cfg.YouTrackHost, fm.YouTrackID)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+cfg.YouTrackToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("YouTrack API Error (%d): %s", resp.StatusCode, string(body))
	}

	return nil
}
