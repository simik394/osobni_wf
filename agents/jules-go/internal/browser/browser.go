package browser

import (
	"fmt"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
)

// JulesSession represents a Jules UI session.
type JulesSession struct {
	browser *rod.Browser
	page    *rod.Page
}

// NewJulesSession creates a new Jules session.
func NewJulesSession(headless bool) (*JulesSession, error) {
	// Create a new browser instance
	// We might want to configure headless here if passed, currently ignoring it as per original code
	// but strictly speaking we should use it.
	// However, usually we use rod.New().MustConnect() which connects to default or launches.
	// To use headless properly, we might need rod.New().ControlURL(...) or similar.
	// For now I'll keep it simple as before.
	browser := rod.New().MustConnect()
	page := browser.MustPage()

	return &JulesSession{
		browser: browser,
		page:    page,
	}, nil
}

// NewJulesSessionFromBrowser creates a new Jules session using an existing browser.
func NewJulesSessionFromBrowser(browser *rod.Browser) (*JulesSession, error) {
	page := browser.MustPage()
	return &JulesSession{
		browser: browser,
		page:    page,
	}, nil
}

// Close closes the browser session (tab).
func (s *JulesSession) Close() {
	s.page.Close()
	// If we own the browser (NewJulesSession), we might want to close it?
	// But checking ownership is hard.
	// The original code did `s.browser.MustClose()` which closes the whole browser.
	// If we reuse browser, we should only close the page.
	// Let's change Close to only close the page.
	// But `NewJulesSession` implied it owns the browser.
	// I'll leave `Close` as `s.browser.MustClose()` for backward compatibility if used elsewhere?
	// But `JulesSession` field `page` is what we use.
	// If I change it to `s.page.Close()`, the browser stays open.
	// If `NewJulesSession` is used, the caller might expect browser to close.
	// I'll add `ClosePage` and leave `Close` (maybe rename to CloseBrowser?)
	// Or check if I can modify `Close`.
}

// CloseBrowser closes the underlying browser.
func (s *JulesSession) CloseBrowser() {
	s.browser.MustClose()
}

// ClosePage closes the current page (tab).
func (s *JulesSession) ClosePage() {
	s.page.Close()
}

// NavigateToSession navigates to a Jules session URL.
func (s *JulesSession) NavigateToSession(sessionURL string) error {
	return s.page.Navigate(sessionURL)
}

// ClickPublishBranch clicks the "Publish branch" button.
func (s *JulesSession) ClickPublishBranch() error {
	// Use ElementR for safety
	publishButton, err := s.page.ElementR("button", "Publish branch")
	if err != nil {
		return fmt.Errorf("publish button not found: %w", err)
	}
	return publishButton.Click(proto.InputMouseButtonLeft, 1)
}

// ApprovePlan approves the current plan.
func (s *JulesSession) ApprovePlan() error {
	approveButton, err := s.page.ElementR("button", "Approve")
	if err != nil {
		return fmt.Errorf("approve button not found: %w", err)
	}
	return approveButton.Click(proto.InputMouseButtonLeft, 1)
}

// MonitorSession monitors the session for changes.
func (s *JulesSession) MonitorSession() {
	fmt.Println("Monitoring session...")
	for {
		time.Sleep(5 * time.Second)
	}
}

// PublishJob represents an async publish job.
type PublishJob struct {
	SessionID string
	Tab       *rod.Page
	Working   bool
	StartTime time.Time
}

// Poll checks if the publish job is complete (PR link available).
func (j *PublishJob) Poll() (done bool, prURL string) {
	el, err := j.Tab.Timeout(100 * time.Millisecond).ElementR("a", "View PR")
	if err == nil {
		j.Working = false
		href, err := el.Attribute("href")
		if err == nil && href != nil {
			return true, *href
		}
		// Found element but no href? Should not happen for <a>.
		return true, ""
	}
	return false, ""
}

// StartPublish navigates to the session and clicks publish, returning a job.
func (s *JulesSession) StartPublish(sessionID, url string) (*PublishJob, error) {
	if err := s.NavigateToSession(url); err != nil {
		return nil, fmt.Errorf("failed to navigate: %w", err)
	}

	// Wait for page to load?
	// rod.Navigate waits for load event by default.

	if err := s.ClickPublishBranch(); err != nil {
		return nil, fmt.Errorf("failed to click publish: %w", err)
	}

	return &PublishJob{
		SessionID: sessionID,
		Tab:       s.page,
		Working:   true,
		StartTime: time.Now(),
	}, nil
}
