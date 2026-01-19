package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"text/tabwriter"

	jules "jules-go"
	"jules-go/internal/browser"
	"jules-go/internal/logging"
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
	listState := listCmd.String("state", "", "Filter by state: AWAITING_USER_FEEDBACK, COMPLETED, etc")

	getCmd := flag.NewFlagSet("get", flag.ExitOnError)

	retryCmd := flag.NewFlagSet("retry", flag.ExitOnError)
	retryMax := retryCmd.Int("max", 3, "Maximum retry attempts")

	publishCmd := flag.NewFlagSet("publish", flag.ExitOnError)
	publishPR := publishCmd.Bool("pr", true, "Publish as PR (true) or just branch (false)")
	publishHeadless := publishCmd.Bool("headless", false, "Run in headless mode")

	publishAllCmd := flag.NewFlagSet("publish-all", flag.ExitOnError)
	publishAllHeadless := publishAllCmd.Bool("headless", false, "Run in headless mode")

	statusCmd := flag.NewFlagSet("status", flag.ExitOnError)

	versionCmd := flag.NewFlagSet("version", flag.ExitOnError)

	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	apiKey := os.Getenv("JULES_API_KEY")
	if apiKey == "" && os.Args[1] != "version" && os.Args[1] != "help" && os.Args[1] != "publish" && os.Args[1] != "publish-all" {
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
		// Filter by state if specified
		if *listState != "" {
			filtered := []*jules.Session{}
			for _, s := range sessions {
				if s.State == *listState {
					filtered = append(filtered, s)
				}
			}
			sessions = filtered
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

	case "publish":
		publishCmd.Parse(os.Args[2:])
		if publishCmd.NArg() < 1 {
			fmt.Fprintln(os.Stderr, "Usage: jules-cli publish <session-id> [--pr=true|false] [--headless]")
			os.Exit(1)
		}
		sessionID := publishCmd.Arg(0)
		sessionURL := fmt.Sprintf("https://jules.google.com/session/%s", sessionID)

		fmt.Printf("Publishing session %s...\n", sessionID)
		bs, err := browser.NewJulesSession(*publishHeadless)
		if err != nil {
			slog.Error("failed to create browser session", "err", err)
			os.Exit(1)
		}
		defer bs.Close()

		if err := bs.NavigateToSession(sessionURL); err != nil {
			slog.Error("failed to navigate to session", "err", err)
			os.Exit(1)
		}

		if *publishPR {
			if err := bs.ClickPublishPR(); err != nil {
				slog.Error("failed to click publish PR", "err", err)
				os.Exit(1)
			}
		} else {
			if err := bs.ClickPublishBranch(); err != nil {
				slog.Error("failed to click publish branch", "err", err)
				os.Exit(1)
			}
		}

		fmt.Println("Waiting for publish to complete...")
		if err := bs.WaitForPublishComplete(); err != nil {
			slog.Error("publish did not complete", "err", err)
			os.Exit(1)
		}
		fmt.Printf("✅ Session %s published successfully!\n", sessionID)

	case "publish-all":
		publishAllCmd.Parse(os.Args[2:])
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

		// Filter to AWAITING_USER_FEEDBACK (Ready for review)
		waiting := []*jules.Session{}
		for _, s := range sessions {
			if s.State == "AWAITING_USER_FEEDBACK" {
				waiting = append(waiting, s)
			}
		}

		fmt.Printf("Found %d sessions waiting for review\n", len(waiting))

		bs, err := browser.NewJulesSession(*publishAllHeadless)
		if err != nil {
			slog.Error("failed to create browser session", "err", err)
			os.Exit(1)
		}
		defer bs.Close()

		for i, s := range waiting {
			sessionURL := fmt.Sprintf("https://jules.google.com/session/%s", s.ID)
			fmt.Printf("[%d/%d] Publishing %s: %s\n", i+1, len(waiting), s.ID, s.Title)

			if err := bs.NavigateToSession(sessionURL); err != nil {
				fmt.Printf("  ❌ Failed to navigate: %v\n", err)
				continue
			}

			if !bs.IsReadyForReview() {
				fmt.Printf("  ⏭️ Not ready for review, skipping\n")
				continue
			}

			if err := bs.ClickPublishPR(); err != nil {
				fmt.Printf("  ❌ Failed to publish: %v\n", err)
				continue
			}

			if err := bs.WaitForPublishComplete(); err != nil {
				fmt.Printf("  ⚠️ Publish may still be in progress: %v\n", err)
			} else {
				fmt.Printf("  ✅ Published!\n")
			}
		}
		fmt.Println("Done!")

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
  list         List all sessions [--format table|json] [--state STATE]
  get          Get session details <session-id>
  retry        Retry a failed session <session-id> [--max N]
  publish      Publish a session's branch/PR <session-id> [--pr=true|false] [--headless]
  publish-all  Publish ALL waiting sessions [--headless]
  status       Show system status
  version      Show version information
  help         Show this help message

Environment:
  JULES_API_KEY  Required API key for Jules API`)
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
