package github

import (
	"context"
	"fmt"
	"os"
	"time"

	"jules-go/internal/metrics"

	"github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

// Monitor is a GitHub PR monitor.
type Monitor struct {
	client    *github.Client
	owner     string
	repo      string
	lastCheck time.Time
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
		client:    client,
		owner:     owner,
		repo:      repo,
		lastCheck: time.Now(),
	}, nil
}

// CheckPRs checks the status of Jules-created PRs.
func (m *Monitor) CheckPRs(ctx context.Context) error {
	defer func() {
		m.lastCheck = time.Now()
	}()

	prs, _, err := m.client.PullRequests.List(ctx, m.owner, m.repo, &github.PullRequestListOptions{
		State:     "closed",
		Sort:      "updated",
		Direction: "desc",
	})
	if err != nil {
		return fmt.Errorf("error fetching pull requests: %w", err)
	}

	for _, pr := range prs {
		// In a real implementation, we'd filter for "Jules-created" PRs.
		mergedAt := pr.GetMergedAt()
		if !mergedAt.IsZero() && mergedAt.After(m.lastCheck) {
			metrics.PRsMergedTotal.Inc()
		}
	}

	return nil
}
