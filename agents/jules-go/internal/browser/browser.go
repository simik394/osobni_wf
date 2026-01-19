package browser

import (
	"fmt"
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

// NewJulesSession creates a new Jules session with authentication support.
func NewJulesSession(headless bool) (*JulesSession, error) {
	// Use user data directory for persistent auth
	homeDir, _ := os.UserHomeDir()
	userDataDir := filepath.Join(homeDir, ".config", "google-chrome")
	
	// Check for alternative paths
	if _, err := os.Stat(userDataDir); os.IsNotExist(err) {
		userDataDir = filepath.Join(homeDir, ".config", "chromium")
	}
	if _, err := os.Stat(userDataDir); os.IsNotExist(err) {
		// Fall back to rod's default profile
		userDataDir = ""
	}

	l := launcher.New()
	if userDataDir != "" {
		l = l.UserDataDir(userDataDir)
	}
	if headless {
		l = l.Headless(true)
	} else {
		l = l.Headless(false)
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
	s.browser.MustClose()
}

// NavigateToSession navigates to a Jules session URL and waits for load.
func (s *JulesSession) NavigateToSession(sessionURL string) error {
	err := s.page.Navigate(sessionURL)
	if err != nil {
		return err
	}
	// Wait for page to be stable
	s.page.MustWaitLoad()
	time.Sleep(2 * time.Second) // Extra wait for dynamic content
	return nil
}

// ClickPublishBranch clicks the "Publish branch" button.
func (s *JulesSession) ClickPublishBranch() error {
	// Wait for button to be visible
	publishButton, err := s.page.Timeout(10 * time.Second).ElementR("button", "Publish branch")
	if err != nil {
		return fmt.Errorf("publish branch button not found: %w", err)
	}
	return publishButton.Click(proto.InputMouseButtonLeft, 1)
}

// ClickPublishPR clicks "Publish PR" from the dropdown.
func (s *JulesSession) ClickPublishPR() error {
	// First, find and click the dropdown arrow next to Publish branch
	dropdown, err := s.page.Timeout(10 * time.Second).ElementR("button", "Publish branch")
	if err != nil {
		return fmt.Errorf("publish button not found: %w", err)
	}
	
	// Click the dropdown to open menu
	dropdown.MustClick()
	time.Sleep(500 * time.Millisecond)
	
	// Look for "Publish PR" option
	publishPR, err := s.page.Timeout(5 * time.Second).ElementR("div", "Publish PR")
	if err != nil {
		// Might already be on "Publish PR" - try clicking directly
		return s.ClickPublishBranch()
	}
	
	return publishPR.Click(proto.InputMouseButtonLeft, 1)
}

// WaitForPublishComplete waits for publishing to complete.
func (s *JulesSession) WaitForPublishComplete() error {
	// Wait for "View branch" or "View PR" to appear
	_, err := s.page.Timeout(60 * time.Second).ElementR("button", "View")
	if err != nil {
		return fmt.Errorf("publish did not complete: %w", err)
	}
	return nil
}

// ApprovePlan approves the current plan.
func (s *JulesSession) ApprovePlan() error {
	approveButton, err := s.page.Timeout(10 * time.Second).ElementR("button", "Approve")
	if err != nil {
		return fmt.Errorf("approve button not found: %w", err)
	}
	return approveButton.Click(proto.InputMouseButtonLeft, 1)
}

// IsReadyForReview checks if session is ready for review.
func (s *JulesSession) IsReadyForReview() bool {
	_, err := s.page.Timeout(2 * time.Second).ElementR("button", "Publish")
	return err == nil
}

// MonitorSession monitors the session for changes.
func (s *JulesSession) MonitorSession() {
	fmt.Println("Monitoring session...")
	for {
		time.Sleep(5 * time.Second)
	}
}
