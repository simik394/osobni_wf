package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"text/tabwriter"

	jules "jules-go"
	"jules-go/internal/browser"
	"jules-go/internal/github"
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

	statusSessionsCmd := flag.NewFlagSet("status-sessions", flag.ExitOnError)
	statusSessionsJSON := statusSessionsCmd.Bool("json", false, "Output as JSON")

	publishCmd := flag.NewFlagSet("publish", flag.ExitOnError)
	publishPR := publishCmd.Bool("pr", true, "Publish as PR (true) or just branch (false)")

	statusCmd := flag.NewFlagSet("status", flag.ExitOnError)

	prStatusCmd := flag.NewFlagSet("pr-status", flag.ExitOnError)
	prStatusRepo := prStatusCmd.String("repo", "", "Filter by repository")

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

	case "status-sessions":
		statusSessionsCmd.Parse(os.Args[2:])
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

		stateMap := map[string]string{
			"AWAITING_PLAN_APPROVAL": "Ready for review",
			"AWAITING_USER_FEEDBACK": "Ready for review",
			"FAILED":                 "Failed",
			"IN_PROGRESS":            "In progress",
			"PLANNING":               "In progress",
			"COMPLETED":              "Completed",
		}

		counts := make(map[string]int)
		total := 0
		for _, s := range sessions {
			displayState, ok := stateMap[s.State]
			if !ok {
				displayState = s.State
			}
			counts[displayState]++
			total++
		}

		if *statusSessionsJSON {
			printJSON(counts)
			return
		}

		fmt.Println("Jules Session Status")
		fmt.Println("====================")

		order := []string{"Ready for review", "Failed", "In progress", "Completed"}
		printed := make(map[string]bool)

		for _, state := range order {
			if count, ok := counts[state]; ok {
				fmt.Printf("%s: %d\n", state, count)
				printed[state] = true
			}
		}

		var otherStates []string
		for state := range counts {
			if !printed[state] {
				otherStates = append(otherStates, state)
			}
		}
		sort.Strings(otherStates)
		for _, state := range otherStates {
			fmt.Printf("%s: %d\n", state, counts[state])
		}
		fmt.Printf("Total: %d\n", total)

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

	case "pr-status":
		prStatusCmd.Parse(os.Args[2:])
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

		repoName := *prStatusRepo
		if repoName == "" {
			repoName = "jules-go"
		}

		owner := "agent-company" // Placeholder
		if strings.Contains(repoName, "/") {
			parts := strings.Split(repoName, "/")
			owner = parts[0]
			repoName = parts[1]
		}

		ghClient, err := github.NewMonitor(owner, repoName)
		if err != nil {
			slog.Error("failed to create github monitor", "err", err)
			os.Exit(1)
		}

		fmt.Printf("PR #  Issue      Status        Title\n")
		fmt.Printf("-------------------------------------------\n")

		for _, s := range sessions {
			if s.PR != "" {
				// Parse PR number from URL
				prNum := extractPRNumber(s.PR)
				if prNum == 0 {
					continue
				}

				// Check GitHub API
				status := ghClient.GetPRStatus(prNum)

				// Truncate title
				title := s.Title
				if len(title) > 40 {
					title = title[:37] + "..."
				}

				fmt.Printf("#%-4d %-12s %-15s %s\n",
					prNum, extractIssue(s.Prompt), status, title)
			}
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
  list            List all sessions [--format table|json] [--state STATE]
  get             Get session details <session-id>
  retry           Retry a failed session <session-id> [--max N]
  publish         Publish a session <session-id> [--pr=true|false]
  status          Show system status
  status-sessions Show session status dashboard [--json]
  pr-status       Show PR status for sessions [--repo owner/name]
  version         Show version information
  help            Show this help message

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

func extractPRNumber(url string) int {
	// Remove trailing slash if present
	url = strings.TrimSuffix(url, "/")
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		last := parts[len(parts)-1]
		if num, err := strconv.Atoi(last); err == nil {
			return num
		}
	}
	return 0
}

func extractIssue(prompt string) string {
	// Simple regex to find issue key like PROJ-123 or TOOLS-56
	re := regexp.MustCompile(`[A-Z]+-\d+`)
	match := re.FindString(prompt)
	if match != "" {
		return match
	}
	return "N/A"
}
