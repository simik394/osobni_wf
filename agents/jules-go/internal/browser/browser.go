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
	browser := rod.New().MustConnect()
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

// NavigateToSession navigates to a Jules session URL.
func (s *JulesSession) NavigateToSession(sessionURL string) error {
	return s.page.Navigate(sessionURL)
}

// ClickPublishBranch clicks the "Publish branch" button.
func (s *JulesSession) ClickPublishBranch() error {
	// Placeholder for the actual selector
	publishButton := s.page.MustElementR("button", "Publish branch")
	return publishButton.Click(proto.InputMouseButtonLeft, 1)
}

// ApprovePlan approves the current plan.
func (s *JulesSession) ApprovePlan() error {
	// Placeholder for the actual selector
	approveButton := s.page.MustElementR("button", "Approve")
	return approveButton.Click(proto.InputMouseButtonLeft, 1)
}

// MonitorSession monitors the session for changes.
func (s *JulesSession) MonitorSession() {
	// Placeholder for monitoring logic
	fmt.Println("Monitoring session...")
	for {
		// Add logic to check for changes
		time.Sleep(5 * time.Second)
	}
}
