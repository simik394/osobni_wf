package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/simik394/vault-librarian/internal/config"
	"github.com/simik394/vault-librarian/internal/db"
	"github.com/simik394/vault-librarian/internal/watcher"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	// Load config
	configPath := os.Getenv("LIBRARIAN_CONFIG")
	if configPath == "" {
		home, _ := os.UserHomeDir()
		configPath = filepath.Join(home, ".config", "librarian", "config.yaml")
	}

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Printf("Warning: could not load config from %s: %v", configPath, err)
		cfg = config.DefaultConfig()
	}
	cfg = cfg.FromEnv()

	ctx := context.Background()

	switch os.Args[1] {
	case "watch":
		runWatch(cfg)
	case "scan":
		runScan(cfg, os.Args[2:])
	case "query":
		if len(os.Args) < 3 {
			fmt.Println("Usage: librarian query <orphans|backlinks|tags|functions|classes> [arg]")
			os.Exit(1)
		}
		runQuery(ctx, cfg, os.Args[2:])
	case "stats":
		runStats(ctx, cfg)
	case "analyze":
		if len(os.Args) < 3 {
			fmt.Println("Usage: librarian analyze <project_name>")
			os.Exit(1)
		}
		runAnalyze(cfg, os.Args[2])
	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`Vault Librarian - Knowledge Graph for Obsidian

Usage:
  librarian watch              Start watching vault for changes
  librarian scan [path]        Perform vault scan (optional: specific path)
  librarian scan --dump        Dump Cypher queries to dump.cypher
  librarian query orphans      List notes with no incoming links
  librarian query backlinks <note>   List notes linking to <note>
  librarian query tags <tag>         List notes with <tag>
  librarian query functions <name>   Find function definitions
  librarian query classes <name>     Find class definitions
  librarian stats              Show graph statistics

Examples:
  librarian scan                        # Full vault scan
  librarian scan agents/                # Scan only agents/ folder
  librarian scan --profile notes        # Use 'notes' profile from config
  librarian analyze 01-pwf              # Trigger AI analysis for project

Configuration:
  Place config.yaml at ~/.config/librarian/config.yaml
  Or set LIBRARIAN_CONFIG=/path/to/config.yaml

Environment:
  VAULT_PATH      Path to Obsidian vault (default: ~/Obsi)
  FALKORDB_ADDR   FalkorDB address (default: localhost:6379)
  FALKORDB_GRAPH  Graph name (default: vault)`)
}

func runWatch(cfg *config.Config) {
	dbClient, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph)
	if err != nil {
		log.Fatalf("Failed to connect to FalkorDB: %v", err)
	}

	ctx := context.Background()
	if err := dbClient.InitSchema(ctx); err != nil {
		log.Fatalf("Failed to init schema: %v", err)
	}

	w, err := watcher.NewWatcher(cfg, dbClient)
	if err != nil {
		log.Fatalf("Failed to create watcher: %v", err)
	}
	defer w.Stop()

	if err := w.Start(); err != nil {
		log.Fatalf("Failed to start watcher: %v", err)
	}
	
	// Create channel to listen for signals
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	
	log.Println("Stopping watcher...")
}

func runScan(cfg *config.Config, args []string) {
	scanPath := ""
	dumpMode := false
	
	for _, arg := range args {
		if arg == "--dump" {
			dumpMode = true
		} else if arg != "" && arg[0] != '-' {
			scanPath = arg
		}
	}

	if scanPath != "" {
		absPath, err := filepath.Abs(scanPath)
		if err != nil {
			log.Fatalf("Invalid path: %v", err)
		}
		log.Printf("Scanning path: %s", absPath)
	} else {
		log.Println("Scanning all configured sources...")
	}

	dbClient, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph)
	if err != nil {
		log.Fatalf("Failed to connect to FalkorDB: %v", err)
	}

	if dumpMode {
		log.Println("Dump mode enabled. Writing to dump.cypher...")
		f, err := os.Create("dump.cypher")
		if err != nil {
			log.Fatalf("Failed to create dump file: %v", err)
		}
		defer f.Close()
		dbClient.SetDumpWriter(f)
	}

	ctx := context.Background()
	if !dumpMode {
		if err := dbClient.InitSchema(ctx); err != nil {
			log.Fatalf("Failed to init schema: %v", err)
		}
	}

	w, err := watcher.NewWatcher(cfg, dbClient)
	if err != nil {
		log.Fatalf("Failed to create watcher: %v", err)
	}

	start := time.Now()
	notes, code, assets, err := w.FullScan(scanPath) 
	if err != nil {
		log.Fatalf("Scan failed: %v", err)
	}

	duration := time.Since(start)
	log.Printf("Scan completed in %v", duration)
	log.Printf("Processed: %d notes, %d code files, %d assets", notes, code, assets)
}

func runQuery(ctx context.Context, cfg *config.Config, args []string) {
	dbClient, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph)
	if err != nil {
		log.Fatalf("Failed to connect to FalkorDB: %v", err)
	}

	cmd := args[0]
	
	switch cmd {
	case "orphans":
		results, err := dbClient.GetOrphans(ctx)
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		printResults(results)
	case "backlinks":
		if len(args) < 2 {
			log.Fatal("Missing note name")
		}
		results, err := dbClient.GetBacklinks(ctx, args[1])
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		printResults(results)
	case "tags":
		if len(args) < 2 {
			log.Fatal("Missing tag name")
		}
		results, err := dbClient.GetNotesByTag(ctx, args[1])
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		printResults(results)
	default:
		log.Fatalf("Unknown query command: %s", cmd)
	}
}

func runStats(ctx context.Context, cfg *config.Config) {
	dbClient, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph)
	if err != nil {
		log.Fatalf("Failed to connect to FalkorDB: %v", err)
	}

	notes, links, tags, err := dbClient.GetStats(ctx)
	if err != nil {
		log.Fatalf("Stats failed: %v", err)
	}

	fmt.Printf("Graph Statistics:\n")
	fmt.Printf("  Notes: %d\n", notes)
	fmt.Printf("  Links: %d\n", links)
	fmt.Printf("  Tags:  %d\n", tags)
}

func printResults(results []string) {
	for _, r := range results {
		fmt.Println(r)
	}
}

func runAnalyze(cfg *config.Config, projectName string) {
	if cfg.Windmill.WebhookURL == "" {
		log.Fatal("Windmill Webhook URL not configured. Set windmill.webhook_url in config or WINDMILL_WEBHOOK_URL env var.")
	}

	log.Printf("Triggering analysis for project: %s", projectName)

	payload := map[string]string{
		"project": projectName,
		// Assuming standard path for now, or could look it up
		"path": filepath.Join("Prods", projectName),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Fatalf("Failed to marshal payload: %v", err)
	}

	req, err := http.NewRequest("POST", cfg.Windmill.WebhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Fatalf("Failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if cfg.Windmill.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Windmill.Token)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Failed to send request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("Analysis triggered successfully! Status: %s", resp.Status)
	} else {
		log.Fatalf("Failed to trigger analysis. Status: %s", resp.Status)
	}
}
