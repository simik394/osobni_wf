package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strings"
	"text/tabwriter"

	jules "jules-go"
	"jules-go/internal/logging"
	"jules-go/internal/youtrack"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	// Initialize logger
	logger := logging.NewLogger("info", "text", "jules-cli")
	slog.SetDefault(logger)

	// Define subcommands
	listCmd := flag.NewFlagSet("list", flag.ExitOnError)
	listFormat := listCmd.String("format", "table", "Output format: table, json")

	getCmd := flag.NewFlagSet("get", flag.ExitOnError)

	retryCmd := flag.NewFlagSet("retry", flag.ExitOnError)
	retryMax := retryCmd.Int("max", 3, "Maximum retry attempts")

	statusCmd := flag.NewFlagSet("status", flag.ExitOnError)

	syncCmd := flag.NewFlagSet("sync-youtrack", flag.ExitOnError)
	dryRun := syncCmd.Bool("dry-run", false, "Preview changes without applying them")

	versionCmd := flag.NewFlagSet("version", flag.ExitOnError)

	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	apiKey := os.Getenv("JULES_API_KEY")
	if apiKey == "" && os.Args[1] != "version" && os.Args[1] != "help" {
		fmt.Fprintln(os.Stderr, "Error: JULES_API_KEY environment variable required")
		os.Exit(1)
	}

	ctx := context.Background()

	switch os.Args[1] {
	case "list":
		listCmd.Parse(os.Args[2:])
		client, err := jules.NewClient(apiKey, logger)
		if err != nil {
			slog.Error("failed to create client", "err", err)
			os.Exit(1)
		}
		sessions, err := client.ListSessions(ctx)
		if err != nil {
			slog.Error("failed to list sessions", "err", err)
			os.Exit(1)
		}
		printSessions(sessions, *listFormat)

	case "get":
		getCmd.Parse(os.Args[2:])
		if getCmd.NArg() < 1 {
			fmt.Fprintln(os.Stderr, "Usage: jules-cli get <session-id>")
			os.Exit(1)
		}
		sessionID := getCmd.Arg(0)
		client, err := jules.NewClient(apiKey, logger)
		if err != nil {
			slog.Error("failed to create client", "err", err)
			os.Exit(1)
		}
		session, err := client.GetSession(ctx, sessionID)
		if err != nil {
			slog.Error("failed to get session", "err", err)
			os.Exit(1)
		}
		printJSON(session)

	case "retry":
		retryCmd.Parse(os.Args[2:])
		if retryCmd.NArg() < 1 {
			fmt.Fprintln(os.Stderr, "Usage: jules-cli retry <session-id> [--max N]")
			os.Exit(1)
		}
		sessionID := retryCmd.Arg(0)
		client, err := jules.NewClient(apiKey, logger)
		if err != nil {
			slog.Error("failed to create client", "err", err)
			os.Exit(1)
		}
		policy := jules.DefaultRetryPolicy()
		policy.MaxRetries = *retryMax
		result, err := client.RetrySessionWithPolicy(ctx, sessionID, policy)
		if err != nil {
			slog.Error("retry failed", "err", err)
			os.Exit(1)
		}
		printJSON(result)

	case "sync-youtrack":
		syncCmd.Parse(os.Args[2:])

		// Initialize YouTrack client
		ytURL := os.Getenv("YOUTRACK_URL")
		ytToken := os.Getenv("YOUTRACK_TOKEN")
		if ytURL == "" || ytToken == "" {
			fmt.Fprintln(os.Stderr, "Error: YOUTRACK_URL and YOUTRACK_TOKEN environment variables required")
			os.Exit(1)
		}

		ytConfig := youtrack.ClientConfig{
			BaseURL: ytURL,
			Token:   ytToken,
		}
		ytClient, err := youtrack.NewClient(ytConfig, logger)
		if err != nil {
			slog.Error("failed to create YouTrack client", "err", err)
			os.Exit(1)
		}

		// Initialize Jules client
		client, err := jules.NewClient(apiKey, logger)
		if err != nil {
			slog.Error("failed to create client", "err", err)
			os.Exit(1)
		}

		sessions, err := client.ListSessions(ctx)
		if err != nil {
			slog.Error("failed to list sessions", "err", err)
			os.Exit(1)
		}

		issuePattern := regexp.MustCompile(`([A-Z]+-\d+)`)

		for _, s := range sessions {
			// Check for COMPLETED state and URL (which we assume is the PR link)
			if s.State == "COMPLETED" && s.URL != "" {
				issues := issuePattern.FindAllString(s.Prompt, -1)

				// Deduplicate issues
				uniqueIssues := make(map[string]bool)
				for _, i := range issues {
					uniqueIssues[i] = true
				}

				for issueID := range uniqueIssues {
					if *dryRun {
						fmt.Printf("[Dry Run] Would update issue %s: State -> Fixed, Comment -> ✅ Merged via %s\n", issueID, s.URL)
						continue
					}

					// Check for existing comments to be idempotent
					comments, err := ytClient.GetComments(ctx, issueID)
					if err != nil {
						slog.Error("failed to get comments", "issue", issueID, "err", err)
						continue
					}

					alreadyCommented := false
					targetComment := "✅ Merged via " + s.URL
					for _, c := range comments {
						if strings.Contains(c.Text, targetComment) {
							alreadyCommented = true
							break
						}
					}

					if !alreadyCommented {
						if err := ytClient.UpdateIssueState(ctx, issueID, "Fixed"); err != nil {
							slog.Error("failed to update issue state", "issue", issueID, "err", err)
						}
						if err := ytClient.AddComment(ctx, issueID, targetComment); err != nil {
							slog.Error("failed to add comment", "issue", issueID, "err", err)
						} else {
							fmt.Printf("Updated issue %s\n", issueID)
						}
					} else {
						// Optionally log that it's already updated
						slog.Debug("issue already updated", "issue", issueID)
					}
				}
			}
		}

	case "status":
		statusCmd.Parse(os.Args[2:])
		budget := jules.DefaultRetryBudget()
		cfg := jules.DefaultSupervisorConfig()
		fmt.Printf("Jules CLI Status\n")
		fmt.Printf("================\n")
		fmt.Printf("Retry Budget: %d tokens available\n", budget.Available())
		fmt.Printf("Supervisor Config: MaxRetries=%d, BufferSize=%d\n", cfg.MaxRetries, cfg.BufferSize)
		fmt.Printf("API Base: https://jules.googleapis.com/v1alpha\n")

	case "version":
		versionCmd.Parse(os.Args[2:])
		fmt.Printf("jules-cli %s (commit: %s, built: %s)\n", version, commit, date)

	case "help":
		printUsage()

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`Jules CLI - AI Agent Orchestration

Usage: jules-cli <command> [options]

Commands:
  list          List all sessions [--format table|json]
  get           Get session details <session-id>
  retry         Retry a failed session <session-id> [--max N]
  sync-youtrack Sync completed sessions to YouTrack [--dry-run]
  status        Show system status
  version       Show version information
  help          Show this help message

Environment:
  JULES_API_KEY   Required API key for Jules API
  YOUTRACK_URL    Required for sync-youtrack
  YOUTRACK_TOKEN  Required for sync-youtrack`)
}

func printSessions(sessions []*jules.Session, format string) {
	if format == "json" {
		printJSON(sessions)
		return
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tSTATE\tTITLE")
	fmt.Fprintln(w, "--\t-----\t-----")
	for _, s := range sessions {
		title := s.Title
		if len(title) > 50 {
			title = title[:47] + "..."
		}
		fmt.Fprintf(w, "%s\t%s\t%s\n", s.ID, s.State, title)
	}
	w.Flush()
}

func printJSON(v interface{}) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(v)
}
