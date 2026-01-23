package inner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	wmill "github.com/windmill-labs/windmill-go-client"
)

type Activity struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	State      string `json:"state"`
	CreateTime string `json:"createTime"`
	UpdateTime string `json:"updateTime"`
}

type activitiesResponse struct {
	Activities    []Activity `json:"activities"`
	NextPageToken string     `json:"nextPageToken"`
}

// main lists all activities for a Jules session
func main(session_id string) (interface{}, error) {
	apiKey, err := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return nil, fmt.Errorf("failed to get JULES_API_KEY variable: %w", err)
	}

	// Ensure prefix
	parent := session_id
	if !strings.HasPrefix(parent, "sessions/") {
		parent = "sessions/" + parent
	}

	var allActivities []Activity
	pageToken := ""
	client := &http.Client{}
	baseURL := fmt.Sprintf("https://jules.googleapis.com/v1alpha/%s/activities", parent)

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

		var result activitiesResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("failed to parse response: %w", err)
		}

		allActivities = append(allActivities, result.Activities...)

		if result.NextPageToken == "" {
			break
		}
		pageToken = result.NextPageToken
	}

	return allActivities, nil
}
