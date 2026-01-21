package inner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	wmill "github.com/windmill-labs/windmill-go-client"
)

type CreateRequest struct {
	Prompt        string        `json:"prompt"`
	SourceContext SourceContext `json:"sourceContext"`
	Title         string        `json:"title,omitempty"`
}

type SourceContext struct {
	Source            string             `json:"source"`
	GithubRepoContext *GithubRepoContext `json:"githubRepoContext,omitempty"`
}

type GithubRepoContext struct {
	StartingBranch string `json:"startingBranch,omitempty"`
}

type Session struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Title      string `json:"title"`
	State      string `json:"state"`
	URL        string `json:"url"`
	CreateTime string `json:"createTime"`
}

// main creates a new Jules session
// prompt: The task description/prompt for Jules
// source: The source ID (e.g., "sources/github/owner/repo")
// starting_branch: Optional branch to start from (default: repo's default branch)
// title: Optional human-readable title for the session
func main(prompt string, source string, starting_branch string, title string) (Session, error) {
	apiKey, err := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return Session{}, fmt.Errorf("failed to get JULES_API_KEY: %w", err)
	}

	if prompt == "" {
		return Session{}, fmt.Errorf("prompt is required")
	}
	if source == "" {
		return Session{}, fmt.Errorf("source is required")
	}

	// Normalize source to include sources/ prefix
	normalizedSource := source
	if !strings.HasPrefix(normalizedSource, "sources/") {
		normalizedSource = "sources/" + normalizedSource
	}

	reqBody := CreateRequest{
		Prompt: prompt,
		SourceContext: SourceContext{
			Source: normalizedSource,
		},
	}

	if starting_branch != "" {
		reqBody.SourceContext.GithubRepoContext = &GithubRepoContext{
			StartingBranch: starting_branch,
		}
	}

	if title != "" {
		reqBody.Title = title
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return Session{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Debug: print request body
	fmt.Printf("Request body: %s\n", string(jsonBody))

	req, err := http.NewRequest("POST", "https://jules.googleapis.com/v1alpha/sessions", bytes.NewBuffer(jsonBody))
	if err != nil {
		return Session{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-goog-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return Session{}, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return Session{}, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return Session{}, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var session Session
	if err := json.Unmarshal(body, &session); err != nil {
		return Session{}, fmt.Errorf("failed to parse response: %w", err)
	}

	return session, nil
}
