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

// GetPRStatus returns the status of a PR.
func (m *Monitor) GetPRStatus(prNum int) string {
	ctx := context.Background()
	pr, _, err := m.client.PullRequests.Get(ctx, m.owner, m.repo, prNum)
	if err != nil {
		return "Error"
	}

	if pr.GetMerged() {
		return "Merged"
	}

	// Check mergeability
	// Note: Mergeable might be nil if GitHub hasn't computed it yet.
	// In a real app we might want to retry or wait.
	if pr.Mergeable != nil && !*pr.Mergeable {
		return "Conflicts!"
	}

	// Check CI status
	if pr.Head == nil || pr.Head.SHA == nil {
		return "Unknown"
	}

	combinedStatus, _, err := m.client.Repositories.GetCombinedStatus(ctx, m.owner, m.repo, *pr.Head.SHA, nil)
	if err != nil {
		return "Error"
	}

	switch combinedStatus.GetState() {
	case "pending":
		return "Pending CI"
	case "failure", "error":
		return "CI Failed"
	case "success":
		return "Ready"
	default:
		// If there are no statuses, or state is something else, we might assume Ready or Unknown.
		// For now, let's treat "success" as explicit Ready.
		// If there are no checks configured, GetState might be pending or empty?
		if combinedStatus.GetState() == "" {
			return "Ready" // No CI configured
		}
		return "Pending CI" // Default to pending for safety
	}
}
