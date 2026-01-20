package jules

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// DebugContext holds contextual information for debugging failed sessions.
type DebugContext struct {
	SessionID    string
	Activities   []*Activity
	ErrorTrace   string
	Hypothesis   string
	SuggestedFix string
	Timestamp    time.Time
}

// FailurePattern represents a common failure pattern.
type FailurePattern struct {
	Pattern  string
	Category string
	Severity string
	Fix      string
}

var knownPatterns = []FailurePattern{
	{Pattern: "rate limit", Category: "throttling", Severity: "low", Fix: "Wait and retry with backoff"},
	{Pattern: "context length", Category: "resource", Severity: "medium", Fix: "Trim conversation history"},
	{Pattern: "timeout", Category: "network", Severity: "medium", Fix: "Increase timeout or split task"},
	{Pattern: "auth", Category: "security", Severity: "high", Fix: "Verify API key and permissions"},
	{Pattern: "invalid json", Category: "data", Severity: "medium", Fix: "Validate request payload format"},
	{Pattern: "not found", Category: "resource", Severity: "low", Fix: "Verify resource ID exists"},
	{Pattern: "permission denied", Category: "security", Severity: "high", Fix: "Check access permissions"},
	{Pattern: "internal server error", Category: "backend", Severity: "high", Fix: "Retry or escalate to support"},
}

// SessionDebugger provides context-aware debugging for failed sessions.
type SessionDebugger struct {
	client *Client
}

// NewSessionDebugger creates a new session debugger.
func NewSessionDebugger(client *Client) *SessionDebugger {
	return &SessionDebugger{client: client}
}

// AnalyzeFailure analyzes a failed session and generates debug context.
func (d *SessionDebugger) AnalyzeFailure(ctx context.Context, sessionID string, errorTrace string) (*DebugContext, error) {
	// Fetch session activities for context
	var activities []*Activity
	if d.client != nil {
		var err error
		activities, err = d.client.ListActivities(ctx, sessionID)
		if err != nil {
			// Continue with empty activities - don't fail the analysis
			activities = []*Activity{}
		}
	}

	dc := &DebugContext{
		SessionID:  sessionID,
		Activities: activities,
		ErrorTrace: errorTrace,
		Timestamp:  time.Now(),
	}

	// Analyze error patterns
	pattern := d.matchPattern(errorTrace)
	if pattern != nil {
		dc.Hypothesis = fmt.Sprintf("Detected %s issue (%s severity): %s",
			pattern.Category, pattern.Severity, pattern.Pattern)
		dc.SuggestedFix = pattern.Fix
	} else {
		dc.Hypothesis = "Unknown failure pattern - requires manual investigation"
		dc.SuggestedFix = d.generateHypothesis(activities, errorTrace)
	}

	return dc, nil
}

// matchPattern finds a matching failure pattern from known patterns.
func (d *SessionDebugger) matchPattern(errorTrace string) *FailurePattern {
	lower := strings.ToLower(errorTrace)
	for _, p := range knownPatterns {
		if strings.Contains(lower, p.Pattern) {
			return &p
		}
	}
	return nil
}

// generateHypothesis creates a hypothesis based on activity analysis.
func (d *SessionDebugger) generateHypothesis(activities []*Activity, errorTrace string) string {
	if len(activities) == 0 {
		return "No activities found - session may not have started properly"
	}

	lastActivity := activities[len(activities)-1]
	return fmt.Sprintf("Session stopped at: %s. Review last activity for clues.", lastActivity.Description)
}

// CriticReport generates a detailed failure report for a session.
func (d *SessionDebugger) CriticReport(ctx context.Context, sessionID string) (string, error) {
	session, err := d.client.GetSession(ctx, sessionID)
	if err != nil {
		return "", fmt.Errorf("failed to get session: %w", err)
	}

	activities, err := d.client.ListActivities(ctx, sessionID)
	if err != nil {
		return "", fmt.Errorf("failed to get activities: %w", err)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Critic Report: Session %s\n\n", sessionID))
	sb.WriteString(fmt.Sprintf("**Session Name**: %s\n", session.Name))
	sb.WriteString(fmt.Sprintf("**Activities Count**: %d\n\n", len(activities)))

	sb.WriteString("## Activity Timeline\n\n")
	for i, a := range activities {
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, a.Description))
	}

	return sb.String(), nil
}
