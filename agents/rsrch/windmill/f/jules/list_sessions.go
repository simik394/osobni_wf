package inner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

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

// main lists all Jules sessions, optionally filtered by state
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
	if state != "" {
		filtered := []Session{}
		for _, s := range allSessions {
			if s.State == state {
				filtered = append(filtered, s)
			}
		}
		return filtered, nil
	}

	return allSessions, nil
}
