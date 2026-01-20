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

	"github.com/alecthomas/chroma/quick"
	"os/exec"
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

	diffCmd := flag.NewFlagSet("diff", flag.ExitOnError)

	delegateCmd := flag.NewFlagSet("delegate", flag.ExitOnError)

	envCmd := flag.NewFlagSet("env", flag.ExitOnError)

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

	case "diff":
		diffCmd.Parse(os.Args[2:])
		if diffCmd.NArg() < 1 {
			fmt.Fprintln(os.Stderr, "Usage: jules-cli diff <session-id>")
			os.Exit(1)
		}
		sessionID := diffCmd.Arg(0)

		// Attempt to read repo URL from config or use default
		// For this implementation we'll look for an environment variable or flag,
		// but since flags are already parsed, we'll use a safe default or checking env.
		repoURL := os.Getenv("JULES_REPO_URL")
		if repoURL == "" {
			// This is a placeholder default, but users should provide it.
			// Ideally we would add a --repo flag to the diff command.
			repoURL = "https://github.com/google/jules"
		}

		fmt.Printf("Fetching diff for session %s (repo: %s)...\n", sessionID, repoURL)

		// Execute local Windmill script using Deno if available, or print instruction
		// In a real deployment, this would be an HTTP POST to the Windmill webhook
		output, err := executeWindmillScript("get_session_diff.ts", map[string]string{
			"session_id": sessionID,
			"repo_url": repoURL,
		})

		if err != nil {
			slog.Error("failed to execute diff script", "err", err)
			os.Exit(1)
		}

		err = quick.Highlight(os.Stdout, output, "diff", "terminal256", "monokai")
		if err != nil {
			fmt.Println(output)
		}

	case "delegate":
		delegateCmd.Parse(os.Args[2:])
		if delegateCmd.NArg() < 1 {
			fmt.Fprintln(os.Stderr, "Usage: jules-cli delegate <issue-id>")
			os.Exit(1)
		}
		issueID := delegateCmd.Arg(0)
		fmt.Printf("Delegating task for issue %s...\n", issueID)

		res, err := executeWindmillScript("delegate_task_from_youtrack.ts", map[string]string{
			"issue_id": issueID,
		})
		if err != nil {
			slog.Error("failed to delegate task", "err", err)
			os.Exit(1)
		}
		fmt.Println("Task delegated successfully. Session created:", res)

	case "env":
		envCmd.Parse(os.Args[2:])
		if envCmd.NArg() < 1 {
			fmt.Fprintln(os.Stderr, "Usage: jules-cli env <push>")
			os.Exit(1)
		}
		subCmd := envCmd.Arg(0)
		if subCmd == "push" {
			fmt.Println("Pushing environment configuration...")

			// Read jules.yaml
			content, err := os.ReadFile("jules.yaml")
			if err != nil {
				slog.Error("failed to read jules.yaml", "err", err)
				os.Exit(1)
			}
			setupScript := string(content)

			_, err = executeWindmillScript("update_repo_env.ts", map[string]string{
				"setup_script": setupScript,
			})
			if err != nil {
				slog.Error("failed to update environment", "err", err)
				os.Exit(1)
			}
			fmt.Println("Environment updated successfully.")
		} else {
			fmt.Fprintf(os.Stderr, "Unknown env command: %s\n", subCmd)
			os.Exit(1)
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
  list         List all sessions [--format table|json] [--state STATE]
  get          Get session details <session-id>
  retry        Retry a failed session <session-id> [--max N]
  publish      Publish a session <session-id> [--pr=true|false]
  diff         Show session diff <session-id>
  delegate     Delegate task from YouTrack issue <issue-id>
  env push     Push environment configuration from jules.yaml
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

func executeWindmillScript(scriptName string, args map[string]string) (string, error) {
	// Construct JSON argument
	jsonArgs, err := json.Marshal(args)
	if err != nil {
		return "", err
	}

	// Determine script directory
	scriptDir := os.Getenv("JULES_SCRIPTS_DIR")
	if scriptDir == "" {
		scriptDir = "agents/jules-go/scripts/windmill"
	}
	scriptPath := fmt.Sprintf("%s/%s", scriptDir, scriptName)

	// Create a temporary wrapper to call the main function with args
	wrapper := fmt.Sprintf(`
import { main } from "./%s";
const args = %s;
main(args).then(res => console.log(typeof res === 'string' ? res : JSON.stringify(res))).catch(err => { console.error(err); Deno.exit(1); });
`, scriptPath, string(jsonArgs))

	// Create temp file for wrapper not easy in Go without imports, so we'll just try to run deno eval
	// But imports need to be resolvable.

	// Simpler approach: verify Deno exists first
	if _, err := exec.LookPath("deno"); err != nil {
		return "", fmt.Errorf("deno not found")
	}

	// Because of import complexity with 'deno run' and local files,
	// we will try to just run the file if it was a standalone script, but they export main.
	// So we need a wrapper.

	// We need --allow-all because these scripts perform net, run, env operations.
	// In a real sandbox this would be more restricted.
	cmd := exec.Command("deno", "eval", "--allow-all", wrapper)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("script execution failed: %v, output: %s", err, string(out))
	}
	return string(out), nil
}
