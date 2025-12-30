//go:build integration
// +build integration

package integration

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/simik394/vault-librarian/internal/config"
	"github.com/simik394/vault-librarian/internal/db"
	"github.com/simik394/vault-librarian/internal/parser"
)

// These tests require a running FalkorDB instance
// Run with: go test -tags=integration ./test/integration/...

const testGraph = "vault_test"

func getTestClient(t *testing.T) *db.Client {
	t.Helper()
	addr := os.Getenv("FALKORDB_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	client, err := db.NewClient(addr, testGraph)
	if err != nil {
		t.Skipf("FalkorDB not available at %s: %v", addr, err)
	}
	return client
}

func cleanupGraph(t *testing.T, client *db.Client) {
	t.Helper()
	ctx := context.Background()
	// Delete all nodes and relationships
	client.Query(ctx, "MATCH (n) DETACH DELETE n")
}

// TestFullScanQueryCycle tests the complete workflow:
// 1. Parse files
// 2. Upsert to database
// 3. Query and verify results
func TestFullScanQueryCycle(t *testing.T) {
	client := getTestClient(t)
	defer cleanupGraph(t, client)

	ctx := context.Background()

	// Initialize schema
	if err := client.InitSchema(ctx); err != nil {
		t.Fatalf("InitSchema failed: %v", err)
	}

	// Create test files
	tmpDir := t.TempDir()
	testFiles := map[string]string{
		"note1.md": `---
title: Note One
tags:
  - project
  - important
---

# Note One

This links to [[Note Two]] and [[Note Three]].
Also has #inline-tag.
`,
		"note2.md": `---
title: Note Two
---

# Note Two

This is an orphan (nothing links here yet).
Has tag #orphan.
`,
		"note3.md": `# Note Three

Simple note with [[Note One]] link back.
`,
		"code.go": `package main

import (
	"fmt"
	"os"
)

type Config struct {
	Name string
}

func main() {
	// TODO: Add error handling
	fmt.Println("hello")
}

func helper() string {
	return "test"
}
`,
	}

	// Write test files
	for name, content := range testFiles {
		path := filepath.Join(tmpDir, name)
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write test file %s: %v", name, err)
		}
	}

	// Parse and upsert markdown files
	for _, name := range []string{"note1.md", "note2.md", "note3.md"} {
		path := filepath.Join(tmpDir, name)
		meta, err := parser.ParseMarkdown(path)
		if err != nil {
			t.Fatalf("ParseMarkdown failed for %s: %v", name, err)
		}
		if err := client.UpsertNote(ctx, meta, "test-project"); err != nil {
			t.Fatalf("UpsertNote failed for %s: %v", name, err)
		}
	}

	// Parse and upsert code file
	codePath := filepath.Join(tmpDir, "code.go")
	codeMeta, err := parser.ParseCode(codePath)
	if err != nil {
		t.Fatalf("ParseCode failed: %v", err)
	}
	if err := client.UpsertCode(ctx, codeMeta, "test-project"); err != nil {
		t.Fatalf("UpsertCode failed: %v", err)
	}

	// Give FalkorDB a moment to index
	time.Sleep(100 * time.Millisecond)

	// Test 1: Get stats
	notes, links, tags, code, funcs, classes, err := client.GetFullStats(ctx)
	if err != nil {
		t.Fatalf("GetFullStats failed: %v", err)
	}

	t.Logf("Stats: notes=%d, links=%d, tags=%d, code=%d, funcs=%d, classes=%d",
		notes, links, tags, code, funcs, classes)

	if notes < 3 {
		t.Errorf("Expected at least 3 notes, got %d", notes)
	}
	if code < 1 {
		t.Errorf("Expected at least 1 code file, got %d", code)
	}
	if funcs < 2 {
		t.Errorf("Expected at least 2 functions (main, helper), got %d", funcs)
	}

	// Test 2: Query orphans (Note Two should be orphan initially)
	orphans, err := client.GetOrphans(ctx)
	if err != nil {
		t.Fatalf("GetOrphans failed: %v", err)
	}
	t.Logf("Orphans: %v", orphans)
	// Note: orphan detection depends on link structure

	// Test 3: Query by tag
	projectNotes, err := client.GetNotesByTag(ctx, "project")
	if err != nil {
		t.Fatalf("GetNotesByTag failed: %v", err)
	}
	if len(projectNotes) < 1 {
		t.Errorf("Expected at least 1 note with 'project' tag, got %d", len(projectNotes))
	}
	t.Logf("Notes with 'project' tag: %v", projectNotes)

	// Test 4: Query backlinks
	backlinks, err := client.GetBacklinks(ctx, "Note Two")
	if err != nil {
		t.Fatalf("GetBacklinks failed: %v", err)
	}
	t.Logf("Backlinks to 'Note Two': %v", backlinks)
	// Note One links to Note Two
	if len(backlinks) < 1 {
		t.Errorf("Expected at least 1 backlink to 'Note Two', got %d", len(backlinks))
	}

	// Test 5: Query functions
	mainFuncs, err := client.GetFunctions(ctx, "main")
	if err != nil {
		t.Fatalf("GetFunctions failed: %v", err)
	}
	if len(mainFuncs) < 1 {
		t.Errorf("Expected to find 'main' function, got %d results", len(mainFuncs))
	}
	t.Logf("'main' function locations: %v", mainFuncs)

	// Test 6: Query classes/structs
	configClasses, err := client.GetClasses(ctx, "Config")
	if err != nil {
		t.Fatalf("GetClasses failed: %v", err)
	}
	if len(configClasses) < 1 {
		t.Errorf("Expected to find 'Config' struct, got %d results", len(configClasses))
	}
	t.Logf("'Config' struct locations: %v", configClasses)
}

// TestDumpModeImport tests the dump mode workflow:
// 1. Generate Cypher dump
// 2. Would import to database (we test the dump generation)
func TestDumpModeGeneration(t *testing.T) {
	// Create a buffer to capture dump output
	var buf bytes.Buffer

	// Create a client in dump mode
	client := getTestClient(t)
	client.SetDumpWriter(&buf)
	defer cleanupGraph(t, client)

	ctx := context.Background()

	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.md")
	content := `---
title: Test
tags: [a, b]
---
# Test
Links to [[Other]].
`
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	meta, err := parser.ParseMarkdown(testFile)
	if err != nil {
		t.Fatalf("ParseMarkdown failed: %v", err)
	}

	// Verify parsing worked
	if len(meta.Tags) < 2 {
		t.Errorf("Expected 2 tags, got %d", len(meta.Tags))
	}
	if len(meta.Wikilinks) < 1 {
		t.Errorf("Expected 1 wikilink, got %d", len(meta.Wikilinks))
	}

	// Upsert in dump mode - this writes to buffer instead of DB
	err = client.UpsertNote(ctx, meta, "dump-test")
	if err != nil {
		t.Fatalf("UpsertNote in dump mode failed: %v", err)
	}

	// Verify dump output contains expected queries
	output := buf.String()
	t.Logf("Dump output length: %d bytes", len(output))

	if len(output) == 0 {
		t.Error("Dump output should not be empty")
	}
	if !bytes.Contains(buf.Bytes(), []byte("GRAPH.QUERY")) {
		t.Error("Dump output should contain GRAPH.QUERY commands")
	}
	if !bytes.Contains(buf.Bytes(), []byte("MERGE")) {
		t.Error("Dump output should contain MERGE commands")
	}

	t.Logf("Parsed: tags=%v, links=%v", meta.Tags, meta.Wikilinks)
}

// TestDeleteOperations tests delete functionality
func TestDeleteOperations(t *testing.T) {
	client := getTestClient(t)
	defer cleanupGraph(t, client)

	ctx := context.Background()
	client.InitSchema(ctx)

	// Create a test note
	tmpDir := t.TempDir()
	testPath := filepath.Join(tmpDir, "deleteme.md")
	os.WriteFile(testPath, []byte("# Delete Me"), 0644)

	meta, _ := parser.ParseMarkdown(testPath)
	client.UpsertNote(ctx, meta, "")

	// Verify it exists
	stats1, _, _, _, _, _, _ := client.GetFullStats(ctx)
	t.Logf("Notes before delete: %d", stats1)

	// Delete it
	err := client.DeleteNote(ctx, testPath)
	if err != nil {
		t.Fatalf("DeleteNote failed: %v", err)
	}

	// Verify it's gone
	time.Sleep(50 * time.Millisecond)
	stats2, _, _, _, _, _, _ := client.GetFullStats(ctx)
	t.Logf("Notes after delete: %d", stats2)

	if stats2 >= stats1 {
		t.Errorf("Note count should decrease after delete, was %d now %d", stats1, stats2)
	}
}

// TestConfigIntegration tests that config properly connects to DB
func TestConfigIntegration(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg = cfg.FromEnv()

	// Verify database config
	if cfg.Database.Addr == "" {
		t.Error("Database address should not be empty")
	}
	if cfg.Database.Graph == "" {
		t.Error("Database graph should not be empty")
	}

	t.Logf("Config: addr=%s, graph=%s", cfg.Database.Addr, cfg.Database.Graph)

	// Try to connect
	client, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph+"_configtest")
	if err != nil {
		t.Skipf("Cannot connect to FalkorDB: %v", err)
	}

	ctx := context.Background()
	// Simple query to verify connection
	_, err = client.Query(ctx, "RETURN 1")
	if err != nil {
		t.Errorf("Query failed: %v", err)
	}
}
