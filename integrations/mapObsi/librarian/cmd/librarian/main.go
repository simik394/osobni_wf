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
		runScan(cfg)
	case "query":
		if len(os.Args) < 3 {
			fmt.Println("Usage: librarian query <orphans|backlinks|tags|functions|classes> [arg]")
			os.Exit(1)
		}
		runQuery(ctx, cfg, os.Args[2:])
	case "stats":
		runStats(ctx, cfg)
	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`Vault Librarian - Knowledge Graph for Obsidian

Usage:
  librarian watch          Start watching vault for changes
  librarian scan           Perform full vault scan
  librarian query orphans  List notes with no incoming links
  librarian query backlinks <note>  List notes linking to <note>
  librarian query tags <tag>        List notes with <tag>
  librarian query functions <name>  Find function definitions
  librarian query classes <name>    Find class definitions
  librarian stats          Show graph statistics

Configuration:
  Place config.yaml at ~/.config/librarian/config.yaml
  Or set LIBRARIAN_CONFIG=/path/to/config.yaml

Environment:
  VAULT_PATH      Path to Obsidian vault (default: ~/Obsi)
  FALKORDB_ADDR   FalkorDB address (default: localhost:6379)
  FALKORDB_GRAPH  Graph name (default: vault)`)
}

func runWatch(cfg *config.Config) {
	dbClient, err := db.NewClient(cfg.FalkorDB.Addr, cfg.FalkorDB.Graph)
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

	log.Println("Performing initial scan...")
	start := time.Now()
	notes, code, assets, err := w.FullScan()
	if err != nil {
		log.Fatalf("Initial scan failed: %v", err)
	}
	log.Printf("Initial scan complete: notes=%d, code=%d, assets=%d in %v", notes, code, assets, time.Since(start))

	if err := w.Start(); err != nil {
		log.Fatalf("Failed to start watcher: %v", err)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down...")
	w.Stop()
}

func runScan(cfg *config.Config) {
	dbClient, err := db.NewClient(cfg.FalkorDB.Addr, cfg.FalkorDB.Graph)
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

	log.Println("Scanning vault...")
	start := time.Now()
	notes, code, assets, err := w.FullScan()
	if err != nil {
		log.Fatalf("Scan failed: %v", err)
	}

	log.Printf("Scan complete: notes=%d, code=%d, assets=%d in %v", notes, code, assets, time.Since(start))
}

func runQuery(ctx context.Context, cfg *config.Config, args []string) {
	dbClient, err := db.NewClient(cfg.FalkorDB.Addr, cfg.FalkorDB.Graph)
	if err != nil {
		log.Fatalf("Failed to connect to FalkorDB: %v", err)
	}

	switch args[0] {
	case "orphans":
		orphans, err := dbClient.GetOrphans(ctx)
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		fmt.Printf("Found %d orphan notes:\n", len(orphans))
		for _, p := range orphans {
			fmt.Println("  " + p)
		}

	case "backlinks":
		if len(args) < 2 {
			fmt.Println("Usage: librarian query backlinks <note-name>")
			os.Exit(1)
		}
		backlinks, err := dbClient.GetBacklinks(ctx, args[1])
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		fmt.Printf("Found %d backlinks to '%s':\n", len(backlinks), args[1])
		for _, p := range backlinks {
			fmt.Println("  " + p)
		}

	case "tags":
		if len(args) < 2 {
			fmt.Println("Usage: librarian query tags <tag>")
			os.Exit(1)
		}
		notes, err := dbClient.GetNotesByTag(ctx, args[1])
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		fmt.Printf("Found %d notes with tag #%s:\n", len(notes), args[1])
		for _, p := range notes {
			fmt.Println("  " + p)
		}

	case "functions":
		if len(args) < 2 {
			fmt.Println("Usage: librarian query functions <name>")
			os.Exit(1)
		}
		funcs, err := dbClient.GetFunctions(ctx, args[1])
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		fmt.Printf("Found %d functions named '%s':\n", len(funcs), args[1])
		for _, f := range funcs {
			fmt.Println("  " + f)
		}

	case "classes":
		if len(args) < 2 {
			fmt.Println("Usage: librarian query classes <name>")
			os.Exit(1)
		}
		classes, err := dbClient.GetClasses(ctx, args[1])
		if err != nil {
			log.Fatalf("Query failed: %v", err)
		}
		fmt.Printf("Found %d classes named '%s':\n", len(classes), args[1])
		for _, c := range classes {
			fmt.Println("  " + c)
		}

	default:
		fmt.Printf("Unknown query type: %s\n", args[0])
		os.Exit(1)
	}
}

func runStats(ctx context.Context, cfg *config.Config) {
	dbClient, err := db.NewClient(cfg.FalkorDB.Addr, cfg.FalkorDB.Graph)
	if err != nil {
		log.Fatalf("Failed to connect to FalkorDB: %v", err)
	}

	notes, links, tags, code, funcs, classes, err := dbClient.GetFullStats(ctx)
	if err != nil {
		log.Fatalf("Failed to get stats: %v", err)
	}

	fmt.Printf("Vault Statistics:\n")
	fmt.Printf("  Notes:     %d\n", notes)
	fmt.Printf("  Links:     %d\n", links)
	fmt.Printf("  Tags:      %d\n", tags)
	fmt.Printf("  Code:      %d\n", code)
	fmt.Printf("  Functions: %d\n", funcs)
	fmt.Printf("  Classes:   %d\n", classes)
}
