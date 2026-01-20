package browser

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
)

// JulesSession represents a Jules UI session.
type JulesSession struct {
	browser *rod.Browser
	page    *rod.Page
}

// NewJulesSession creates a new Jules session.
func NewJulesSession(headless bool) (*JulesSession, error) {
	if os.Getenv("JULES_USE_WINDMILL") == "true" {
		// Return empty session for remote execution
		return &JulesSession{}, nil
	}

	// Use user data directory for persistent auth
	homeDir, _ := os.UserHomeDir()
	userDataDir := filepath.Join(homeDir, ".config", "google-chrome")

	l := launcher.New()
	if _, err := os.Stat(userDataDir); err == nil {
		l = l.UserDataDir(userDataDir)
	}

	url := l.MustLaunch()
	browser := rod.New().ControlURL(url).MustConnect()
	page := browser.MustPage()

	return &JulesSession{
		browser: browser,
		page:    page,
	}, nil
}

// Close closes the browser session.
func (s *JulesSession) Close() {
	if s.browser != nil {
		s.browser.MustClose()
	}
}

// NavigateToSession navigates to a Jules session URL.
func (s *JulesSession) NavigateToSession(sessionURL string) error {
	if s.page == nil {
		return fmt.Errorf("browser not initialized")
	}
	return s.page.Navigate(sessionURL)
}

// StartPublish triggers the publishing process (local or remote).
func (s *JulesSession) StartPublish(sessionID string, mode string) error {
	if os.Getenv("JULES_USE_WINDMILL") == "true" {
		return s.triggerWindmillPublish(sessionID, mode)
	}
	return fmt.Errorf("local publishing not implemented for this command, use JULES_USE_WINDMILL=true")
}

func (s *JulesSession) triggerWindmillPublish(sessionID string, mode string) error {
	token := os.Getenv("WINDMILL_TOKEN")
	url := os.Getenv("WINDMILL_URL")
	workspace := os.Getenv("WINDMILL_WORKSPACE")

	if token == "" || url == "" || workspace == "" {
		return fmt.Errorf("WINDMILL_TOKEN, WINDMILL_URL, and WINDMILL_WORKSPACE env vars required")
	}

	endpoint := fmt.Sprintf("%s/api/w/%s/jobs/run/p/f/jules/click_publish_session", url, workspace)

	if mode == "" {
		mode = "pr"
	}

	data := map[string]string{
		"session_id": sessionID,
		"mode":       mode,
	}
	jsonData, _ := json.Marshal(data)

	req, _ := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to trigger windmill: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("windmill error (%d): %s", resp.StatusCode, string(body))
	}

	fmt.Printf("Windmill Job Triggered: %s\n", string(body))
	return nil
}

// ClickPublishBranch clicks the "Publish branch" button (Local only).
func (s *JulesSession) ClickPublishBranch() error {
	if s.page == nil {
		return fmt.Errorf("browser not initialized")
	}
	publishButton := s.page.MustElementR("button", "Publish branch")
	return publishButton.Click(proto.InputMouseButtonLeft, 1)
}

// ApprovePlan approves the current plan (Local only).
func (s *JulesSession) ApprovePlan() error {
	if s.page == nil {
		return fmt.Errorf("browser not initialized")
	}
	approveButton := s.page.MustElementR("button", "Approve")
	return approveButton.Click(proto.InputMouseButtonLeft, 1)
}

// MonitorSession monitors the session for changes.
func (s *JulesSession) MonitorSession() {
	if s.page == nil {
		return
	}
	fmt.Println("Monitoring session...")
	for {
		time.Sleep(5 * time.Second)
	}
}
