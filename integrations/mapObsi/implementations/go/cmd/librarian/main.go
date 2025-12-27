package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/simik394/vault-librarian/internal/config"
	"github.com/simik394/vault-librarian/internal/db"
	"github.com/simik394/vault-librarian/internal/export"
	"github.com/simik394/vault-librarian/internal/ingest"
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
	case "ingest-scip":
		runIngestSCIP(cfg, os.Args[2:])
	case "export":
		if len(os.Args) < 3 {
			fmt.Println("Usage: librarian export <mermaid|dot> [path]")
			os.Exit(1)
		}
		runExport(cfg, os.Args[2:])
	case "report":
		if len(os.Args) < 3 {
			fmt.Println("Usage: librarian report <project-path> <output-dir>")
			os.Exit(1)
		}
		runReport(cfg, os.Args[2:])
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
func runIngestSCIP(cfg *config.Config, args []string) {
	if len(args) < 1 {
		fmt.Println("Usage: librarian ingest-scip <path-to-index.scip>")
		os.Exit(1)
	}

	indexPath := args[0]
	dbClient, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph)
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	if err := ingest.IngestSCIP(ctx, indexPath, dbClient); err != nil {
		log.Fatalf("Ingestion failed: %v", err)
	}
	fmt.Println("Ingestion complete.")
}

func runExport(cfg *config.Config, args []string) {
	format := args[0]
	scopePath := ""
	if len(args) > 1 {
		scopePath = args[1]
	}

	dbClient, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph)
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	var output string

	switch format {
	case "mermaid":
		output, err = export.ExportMermaid(ctx, dbClient, scopePath, export.DefaultExportOptions())
	case "dot":
		output, err = export.ExportDOT(ctx, dbClient, scopePath, export.DefaultExportOptions())
	case "plantuml":
		pumlMap, err := export.ExportPlantUML(ctx, dbClient, scopePath, export.DefaultExportOptions())
		if err == nil {
			var sb strings.Builder
			for filename, content := range pumlMap {
				sb.WriteString(fmt.Sprintf("=== %s ===\n", filename))
				sb.WriteString(content)
				sb.WriteString("\n")
			}
			output = sb.String()
		} else {
			// Propagate error
			output = ""
		}
	default:
		log.Fatalf("Unknown export format: %s. Supported: mermaid, dot, plantuml", format)
	}

	if err != nil {
		log.Fatalf("Export failed: %v", err)
	}

	fmt.Println(output)
}

func runReport(cfg *config.Config, args []string) {
	// Parse flags
	var excludes []string
	detail := "medium"
	scopePath := ""
	outputDir := ""

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--exclude":
			if i+1 < len(args) {
				excludes = append(excludes, args[i+1])
				i++
			}
		case "--detail":
			if i+1 < len(args) {
				detail = args[i+1]
				i++
			}
		default:
			if scopePath == "" {
				scopePath = args[i]
			} else if outputDir == "" {
				outputDir = args[i]
			}
		}
	}

	if scopePath == "" || outputDir == "" {
		fmt.Println("Usage: librarian report <project-path> <output-dir> [--exclude pattern] [--detail high|medium|low]")
		os.Exit(1)
	}

	// Build options
	opts := export.DefaultExportOptions()
	opts.Detail = detail
	if len(excludes) > 0 {
		opts.Excludes = excludes
	}

	dbClient, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph)
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()

	// 1. Generate Mermaid (Internal Structure)
	optsInternal := opts
	optsInternal.Filter = export.FilterInternal
	mermaidInternal, err := export.ExportMermaid(ctx, dbClient, scopePath, optsInternal)
	if err != nil {
		log.Printf("Warning: Failed to generate Internal Mermaid: %v", err)
	}

	// 3. Generate Mermaid (Classes)
	mermaidClasses, err := export.ExportMermaidClasses(ctx, dbClient, scopePath, opts)
	if err != nil {
		log.Printf("Warning: Failed to generate Mermaid Classes: %v", err)
	}

	// 4. Generate Mermaid (Packages)
	mermaidPackages, err := export.ExportMermaidPackages(ctx, dbClient, scopePath, opts)
	if err != nil {
		log.Printf("Warning: Failed to generate Mermaid Packages: %v", err)
	}

	// 5. Generate PlantUML
	pumlContent, err := export.ExportPlantUML(ctx, dbClient, scopePath, opts)
	if err != nil {
		log.Printf("Warning: Failed to generate PlantUML: %v", err)
	}

	// 6. Algorithm Meta-Visualization
	algoMermaid := export.ExportAlgorithmDiagram()

	// 7. Generate Full Report
	err = export.GenerateReport(outputDir, pumlContent, mermaidInternal, mermaidClasses, mermaidPackages, algoMermaid)
	if err != nil {
		fmt.Printf("Error generating HTML report: %v\n", err)
	}

	// 8. Generate Markdown Report (for Obsidian/IDE)
	err = export.GenerateMarkdownReport(filepath.Join(outputDir, "report.md"), pumlContent, mermaidInternal, mermaidClasses, mermaidPackages, algoMermaid)
	if err != nil {
		fmt.Printf("Error generating Markdown report: %v\n", err)
	}

	fmt.Printf("Report generated at: %s/index.html\n", outputDir)
	fmt.Printf("Markdown report:     %s/report.md\n", outputDir)
	fmt.Printf("Options used: detail=%s, excludes=%v\n", opts.Detail, opts.Excludes)
}
