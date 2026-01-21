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

// main gets a single activity by session and activity ID
func main(session_id string, activity_id string) (interface{}, error) {
	apiKey, err := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return nil, fmt.Errorf("failed to get JULES_API_KEY variable: %w", err)
	}

	session := session_id
	if !strings.HasPrefix(session, "sessions/") {
		session = "sessions/" + session
	}

	// Construct URL: sessions/X/activities/Y
	activityPath := activity_id
	if strings.Contains(activityPath, "sessions/") {
		// If full path provided, use it directly
		activityPath = strings.TrimPrefix(activityPath, "v1alpha/")
	} else {
		// Just the activity ID
		activityPath = fmt.Sprintf("%s/activities/%s", session, activity_id)
	}

	client := &http.Client{}
	url := "https://jules.googleapis.com/v1alpha/" + activityPath

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

	var activity Activity
	if err := json.Unmarshal(body, &activity); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return activity, nil
}
