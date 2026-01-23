package inner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	wmill "github.com/windmill-labs/windmill-go-client"
)

type Source struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	CreateTime  string `json:"createTime"`
	UpdateTime  string `json:"updateTime"`
}

// main gets a single Jules source by ID
func main(source_id string) (interface{}, error) {
	apiKey, err := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return nil, fmt.Errorf("failed to get JULES_API_KEY variable: %w", err)
	}

	// Ensure prefix
	id := source_id
	if !strings.HasPrefix(id, "sources/") {
		id = "sources/" + id
	}

	client := &http.Client{}
	url := "https://jules.googleapis.com/v1alpha/" + id

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

	var source Source
	if err := json.Unmarshal(body, &source); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return source, nil
}
