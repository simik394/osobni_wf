package inner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	wmill "github.com/windmill-labs/windmill-go-client"
)

type Source struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	CreateTime  string `json:"createTime"`
	UpdateTime  string `json:"updateTime"`
}

type sourcesResponse struct {
	Sources       []Source `json:"sources"`
	NextPageToken string   `json:"nextPageToken"`
}

// main lists all Jules sources with optional filter
func main(filter string) (interface{}, error) {
	apiKey, err := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return nil, fmt.Errorf("failed to get JULES_API_KEY variable: %w", err)
	}

	var allSources []Source
	pageToken := ""
	client := &http.Client{}
	baseURL := "https://jules.googleapis.com/v1alpha/sources"

	for {
		url := baseURL
		sep := "?"
		if pageToken != "" {
			url = fmt.Sprintf("%s%spageToken=%s", url, sep, pageToken)
			sep = "&"
		}
		if filter != "" {
			url = fmt.Sprintf("%s%sfilter=%s", url, sep, filter)
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

		var result sourcesResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("failed to parse response: %w", err)
		}

		allSources = append(allSources, result.Sources...)

		if result.NextPageToken == "" {
			break
		}
		pageToken = result.NextPageToken
	}

	return allSources, nil
}
