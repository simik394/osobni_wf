package inner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	wmill "github.com/windmill-labs/windmill-go-client"
)

type Session struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Title      string `json:"title"`
	State      string `json:"state"`
	Prompt     string `json:"prompt"`
	URL        string `json:"url"`
	CreateTime string `json:"createTime"`
	UpdateTime string `json:"updateTime"`
}

type sessionsResponse struct {
	Sessions      []Session `json:"sessions"`
	NextPageToken string    `json:"nextPageToken"`
}

type StateSummary struct {
	Completed            int `json:"completed"`
	Failed               int `json:"failed"`
	AwaitingUserFeedback int `json:"awaiting_user_feedback"`
	Active               int `json:"active"`
	Paused               int `json:"paused"`
	Other                int `json:"other"`
}

type SourceSummary struct {
	Source string `json:"source"`
	Count  int    `json:"count"`
}

type SessionsResult struct {
	Total     int             `json:"total"`
	ByState   StateSummary    `json:"by_state"`
	BySources []SourceSummary `json:"by_sources"`
	Sessions  []Session       `json:"sessions"`
}

// main lists all Jules sessions with summary statistics
func main(state string) (interface{}, error) {
	apiKey, err := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return nil, fmt.Errorf("failed to get JULES_API_KEY variable: %w", err)
	}

	var allSessions []Session
	pageToken := ""
	client := &http.Client{}
	baseURL := "https://jules.googleapis.com/v1alpha/sessions"

	for {
		url := baseURL
		if pageToken != "" {
			url = fmt.Sprintf("%s?pageToken=%s", baseURL, pageToken)
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("x-goog-api-key", apiKey)

		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("API request failed: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to read response: %w", err)
		}

		var result sessionsResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("failed to parse response: %w", err)
		}

		allSessions = append(allSessions, result.Sessions...)

		if result.NextPageToken == "" {
			break
		}
		pageToken = result.NextPageToken
	}

	// Filter by state if specified
	sessions := allSessions
	if state != "" {
		filtered := []Session{}
		for _, s := range allSessions {
			if s.State == state {
				filtered = append(filtered, s)
			}
		}
		sessions = filtered
	}

	// Compute statistics
	var stats StateSummary
	sourceCounts := make(map[string]int)

	for _, s := range sessions {
		switch s.State {
		case "COMPLETED":
			stats.Completed++
		case "FAILED":
			stats.Failed++
		case "AWAITING_USER_FEEDBACK":
			stats.AwaitingUserFeedback++
		case "ACTIVE":
			stats.Active++
		case "PAUSED":
			stats.Paused++
		default:
			stats.Other++
		}

		// Extract source from prompt or name (look for github/owner/repo pattern)
		source := extractSource(s.Prompt)
		if source != "" {
			sourceCounts[source]++
		}
	}

	// Convert source counts to sorted list
	var sources []SourceSummary
	for src, count := range sourceCounts {
		sources = append(sources, SourceSummary{Source: src, Count: count})
	}

	return SessionsResult{
		Total:     len(sessions),
		ByState:   stats,
		BySources: sources,
		Sessions:  sessions,
	}, nil
}

// extractSource tries to find github/owner/repo pattern in text
func extractSource(text string) string {
	// Look for common patterns
	patterns := []string{
		"simik394/osobni_wf",
		"simik394/DP",
		"simik394/rentman_tasks_connector",
		"simik394/dev",
		"simik394/Research",
		"simik394/myConfigs",
		"simik394/moje",
		"simik394/Invent--",
		"simik394/.obsidian",
		"simik394/tabmgr2md",
		"simik394/updownmonitor",
	}

	lower := strings.ToLower(text)
	for _, p := range patterns {
		if strings.Contains(lower, strings.ToLower(p)) {
			return p
		}
	}

	// Try generic github pattern
	if idx := strings.Index(text, "github/"); idx != -1 {
		end := idx + 7
		for end < len(text) && text[end] != ' ' && text[end] != '.' && text[end] != ')' {
			end++
		}
		return text[idx:end]
	}

	return "unknown"
}
