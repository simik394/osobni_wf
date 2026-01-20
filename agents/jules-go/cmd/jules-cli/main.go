package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"text/tabwriter"
	"time"

	jules "jules-go"
	"jules-go/internal/browser"
	"jules-go/internal/logging"

	"github.com/go-rod/rod"
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

	statusCmd := flag.NewFlagSet("status", flag.ExitOnError)

	versionCmd := flag.NewFlagSet("version", flag.ExitOnError)

	publishAllCmd := flag.NewFlagSet("publish-all", flag.ExitOnError)
	publishAsync := publishAllCmd.Bool("async", false, "Run publish jobs asynchronously")

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
			fmt.Fprintln(os.Stderr, "Usage: jules-cli publish <session-id> [--pr=true|false]")
			os.Exit(1)
		}
		sessionID := publishCmd.Arg(0)
		mode := "branch"
		if *publishPR {
			mode = "pr"
		}

		fmt.Printf("Publishing session %s (mode=%s)...\n", sessionID, mode)

		sess, err := browser.NewJulesSession(false)
		if err != nil {
			slog.Error("failed to create session", "err", err)
			os.Exit(1)
		}
		defer sess.Close()

		if err := sess.StartPublish(sessionID, mode); err != nil {
			slog.Error("publish failed", "err", err)
			os.Exit(1)
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

		// Filter for sessions that might be ready to publish (e.g., COMPLETED)
		// Assuming we only try to publish COMPLETED sessions
		var eligibleSessions []*jules.Session
		for _, s := range sessions {
			if s.State == "COMPLETED" {
				eligibleSessions = append(eligibleSessions, s)
			}
		}
		fmt.Printf("Found %d completed sessions out of %d total.\n", len(eligibleSessions), len(sessions))

		if *publishAsync {
			fmt.Println("Starting async publish...")
			// Create a shared browser for all tabs
			b := rod.New().MustConnect()
			defer b.MustClose()

			var jobs []*browser.PublishJob
			for _, s := range eligibleSessions {
				sess, err := browser.NewJulesSessionFromBrowser(b)
				if err != nil {
					slog.Error("failed to create browser session", "session_id", s.ID, "err", err)
					continue
				}

				fmt.Printf("Starting publish for %s...\n", s.ID)
				job, err := sess.StartLocalPublish(s.ID, s.URL)
				if err != nil {
					slog.Warn("failed to start publish (skipping)", "session_id", s.ID, "err", err)
					sess.ClosePage()
					continue
				}
				jobs = append(jobs, job)
			}

			fmt.Printf("Polling %d jobs...\n", len(jobs))
			doneCount := 0
			// Simple polling loop
			for doneCount < len(jobs) {
				workingCount := 0
				for _, job := range jobs {
					if job.Working {
						done, prURL := job.Poll()
						if done {
							if prURL != "" {
								fmt.Printf("Session %s Published: %s\n", job.SessionID, prURL)
							} else {
								fmt.Printf("Session %s Finished (No PR link found)\n", job.SessionID)
							}
							job.Tab.Close()
							doneCount++
						} else {
							workingCount++
						}
					}
				}
				if workingCount > 0 {
					time.Sleep(1 * time.Second)
				}
			}
			fmt.Println("All async jobs completed.")

		} else {
			// Blocking mode
			fmt.Println("Starting blocking publish...")
			for _, s := range eligibleSessions {
				fmt.Printf("Processing session %s...\n", s.ID)
				sess, err := browser.NewJulesSession(false)
				if err != nil {
					slog.Error("failed to create browser", "session_id", s.ID, "err", err)
					continue
				}

				job, err := sess.StartLocalPublish(s.ID, s.URL)
				if err != nil {
					slog.Warn("failed to start publish", "session_id", s.ID, "err", err)
					sess.CloseBrowser()
					continue
				}

				for job.Working {
					done, prURL := job.Poll()
					if done {
						if prURL != "" {
							fmt.Printf("Session %s Published: %s\n", s.ID, prURL)
						} else {
							fmt.Printf("Session %s Finished (No PR link)\n", s.ID)
						}
					} else {
						time.Sleep(500 * time.Millisecond)
					}
				}
				sess.CloseBrowser()
			}
			fmt.Println("All blocking jobs completed.")
		}

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
<<<<<<< HEAD
  list        List all sessions [--format table|json]
  get         Get session details <session-id>
  retry       Retry a failed session <session-id> [--max N]
  publish-all Publish all completed sessions [--async]
  status      Show system status
  version     Show version information
  help        Show this help message
=======
  list         List all sessions [--format table|json] [--state STATE]
  get          Get session details <session-id>
  retry        Retry a failed session <session-id> [--max N]
  publish      Publish a session <session-id> [--pr=true|false]
  status       Show system status
  version      Show version information
  help         Show this help message
>>>>>>> main

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
