package github

import (
	"context"
	"fmt"
	"os"

	"github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

// Monitor is a GitHub PR monitor.
type Monitor struct {
	client *github.Client
	owner  string
	repo   string
}

// NewMonitor creates a new GitHub PR monitor.
func NewMonitor(owner, repo string) (*Monitor, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN environment variable not set")
	}

	ctx := context.Background()
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	tc := oauth2.NewClient(ctx, ts)

	client := github.NewClient(tc)

	return &Monitor{
		client: client,
		owner:  owner,
		repo:   repo,
	}, nil
}

// CheckPRs checks the status of Jules-created PRs.
func (m *Monitor) CheckPRs(ctx context.Context) error {
	prs, _, err := m.client.PullRequests.List(ctx, m.owner, m.repo, &github.PullRequestListOptions{
		State: "open",
	})
	if err != nil {
		return fmt.Errorf("error fetching pull requests: %w", err)
	}

	for _, pr := range prs {
		// In a real implementation, we'd filter for "Jules-created" PRs,
		// but for now, we'll check all open PRs.
		fmt.Printf("Checking PR #%d: %s\n", pr.GetNumber(), pr.GetTitle())

		// Check the status of the PR
		if pr.GetMerged() {
			fmt.Printf("PR #%d is merged.\n", pr.GetNumber())
			continue
		}

		// Get the checks for the PR
		checks, _, err := m.client.Checks.ListCheckRunsForRef(ctx, m.owner, m.repo, pr.GetHead().GetSHA(), &github.ListCheckRunsOptions{})
		if err != nil {
			return fmt.Errorf("error fetching checks for PR #%d: %w", pr.GetNumber(), err)
		}

		fmt.Printf("Checks for PR #%d:\n", pr.GetNumber())
		for _, check := range checks.CheckRuns {
			fmt.Printf("- %s: %s\n", check.GetName(), check.GetStatus())
		}
	}

	return nil
}
