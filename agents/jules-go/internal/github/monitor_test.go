package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/google/go-github/v60/github"
)

// setup sets up a test HTTP server along with a github.Client that is
// configured to talk to that test server. Tests should register handlers on
// mux which provide mock responses for the API method being tested.
func setup() (client *github.Client, mux *http.ServeMux, serverURL string, teardown func()) {
	// mux is the HTTP request multiplexer used with the test server.
	mux = http.NewServeMux()

	// server is a test HTTP server used to provide mock API responses.
	server := httptest.NewServer(mux)

	// client is the GitHub client being tested and is
	// configured to use that server
	client = github.NewClient(nil)
	client.BaseURL, _ = url.Parse(server.URL + "/")

	return client, mux, server.URL, server.Close
}

func TestCheckPRs(t *testing.T) {
	client, mux, _, teardown := setup()
	defer teardown()

	mux.HandleFunc("/repos/test-owner/test-repo/pulls", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		fmt.Fprint(w, `[{"number": 1, "state": "open", "title": "test pr", "merged": false, "head": {"sha": "test-sha"}}]`)
	})

	mux.HandleFunc("/repos/test-owner/test-repo/commits/test-sha/check-runs", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		cr := github.ListCheckRunsResults{
			CheckRuns: []*github.CheckRun{
				{
					Name:   github.String("test-check"),
					Status: github.String("completed"),
				},
			},
		}
		if err := json.NewEncoder(w).Encode(cr); err != nil {
			t.Fatalf("json.NewEncoder.Encode returned an error: %v", err)
		}
	})

	monitor := &Monitor{
		client: client,
		owner:  "test-owner",
		repo:   "test-repo",
	}

	err := monitor.CheckPRs(context.Background())
	if err != nil {
		t.Errorf("CheckPRs returned an error: %v", err)
	}
}

func testMethod(t *testing.T, r *http.Request, want string) {
	t.Helper()
	if got := r.Method; got != want {
		t.Errorf("Request method: %v, want %v", got, want)
	}
}

func TestNewMonitor(t *testing.T) {
	// Test with GITHUB_TOKEN set
	t.Setenv("GITHUB_TOKEN", "test-token")
	monitor, err := NewMonitor("test-owner", "test-repo")
	if err != nil {
		t.Errorf("NewMonitor returned an error: %v", err)
	}
	if monitor == nil {
		t.Error("NewMonitor returned a nil monitor")
	}

	// Test without GITHUB_TOKEN set
	t.Setenv("GITHUB_TOKEN", "")
	_, err = NewMonitor("test-owner", "test-repo")
	if err == nil {
		t.Error("NewMonitor did not return an error when GITHUB_TOKEN was not set")
	}
}
