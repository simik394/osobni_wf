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

func TestGetPRStatus(t *testing.T) {
	tests := []struct {
		name         string
		prNum        int
		mockResponse func(w http.ResponseWriter, r *http.Request)
		want         string
	}{
		{
			name:  "Merged",
			prNum: 1,
			mockResponse: func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/repos/o/r/pulls/1" {
					fmt.Fprint(w, `{"merged": true}`)
				}
			},
			want: "Merged",
		},
		{
			name:  "Conflicts",
			prNum: 2,
			mockResponse: func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/repos/o/r/pulls/2" {
					fmt.Fprint(w, `{"mergeable": false}`)
				}
			},
			want: "Conflicts!",
		},
		{
			name:  "Pending CI",
			prNum: 3,
			mockResponse: func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/repos/o/r/pulls/3" {
					fmt.Fprint(w, `{"mergeable": true, "head": {"sha": "sha1"}}`)
				} else if r.URL.Path == "/repos/o/r/commits/sha1/status" {
					fmt.Fprint(w, `{"state": "pending"}`)
				}
			},
			want: "Pending CI",
		},
		{
			name:  "CI Failed",
			prNum: 4,
			mockResponse: func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/repos/o/r/pulls/4" {
					fmt.Fprint(w, `{"mergeable": true, "head": {"sha": "sha2"}}`)
				} else if r.URL.Path == "/repos/o/r/commits/sha2/status" {
					fmt.Fprint(w, `{"state": "failure"}`)
				}
			},
			want: "CI Failed",
		},
		{
			name:  "Ready",
			prNum: 5,
			mockResponse: func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/repos/o/r/pulls/5" {
					fmt.Fprint(w, `{"mergeable": true, "head": {"sha": "sha3"}}`)
				} else if r.URL.Path == "/repos/o/r/commits/sha3/status" {
					fmt.Fprint(w, `{"state": "success"}`)
				}
			},
			want: "Ready",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mux := http.NewServeMux()
			mux.HandleFunc("/", tt.mockResponse)
			server := httptest.NewServer(mux)
			defer server.Close()

			client := github.NewClient(nil)
			url := server.URL + "/"
			client.BaseURL, _ = client.BaseURL.Parse(url)

			m := &Monitor{
				client: client,
				owner:  "o",
				repo:   "r",
			}

			if got := m.GetPRStatus(tt.prNum); got != tt.want {
				t.Errorf("GetPRStatus() = %v, want %v", got, tt.want)
			}
		})
	}
}
