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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

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
	err := client.InitSchema(ctx)
	require.NoError(t, err, "InitSchema failed")

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
		err := os.WriteFile(path, []byte(content), 0644)
		require.NoError(t, err, "Failed to write test file %s", name)
	}

	// Parse and upsert markdown files
	for _, name := range []string{"note1.md", "note2.md", "note3.md"} {
		path := filepath.Join(tmpDir, name)
		meta, err := parser.ParseMarkdown(path)
		require.NoError(t, err, "ParseMarkdown failed for %s", name)

		err = client.UpsertNote(ctx, meta, "test-project")
		require.NoError(t, err, "UpsertNote failed for %s", name)
	}

	// Parse and upsert code file
	codePath := filepath.Join(tmpDir, "code.go")
	codeMeta, err := parser.ParseCode(codePath)
	require.NoError(t, err, "ParseCode failed")

	err = client.UpsertCode(ctx, codeMeta, "test-project")
	require.NoError(t, err, "UpsertCode failed")

	// Give FalkorDB a moment to index
	time.Sleep(100 * time.Millisecond)

	// Test 1: Get stats
	notes, links, tags, code, funcs, classes, err := client.GetFullStats(ctx)
	assert.NoError(t, err, "GetFullStats failed")

	t.Logf("Stats: notes=%d, links=%d, tags=%d, code=%d, funcs=%d, classes=%d",
		notes, links, tags, code, funcs, classes)

	assert.GreaterOrEqual(t, notes, 3, "Expected at least 3 notes")
	assert.GreaterOrEqual(t, code, 1, "Expected at least 1 code file")
	assert.GreaterOrEqual(t, funcs, 2, "Expected at least 2 functions")

	// Test 2: Query orphans (Note Two should be orphan initially)
	orphans, err := client.GetOrphans(ctx)
	assert.NoError(t, err, "GetOrphans failed")
	t.Logf("Orphans: %v", orphans)
	// Note: orphan detection depends on link structure

	// Test 3: Query by tag
	projectNotes, err := client.GetNotesByTag(ctx, "project")
	assert.NoError(t, err, "GetNotesByTag failed")
	assert.NotEmpty(t, projectNotes, "Expected at least 1 note with 'project' tag")
	t.Logf("Notes with 'project' tag: %v", projectNotes)

	// Test 4: Query backlinks
	backlinks, err := client.GetBacklinks(ctx, "Note Two")
	assert.NoError(t, err, "GetBacklinks failed")
	t.Logf("Backlinks to 'Note Two': %v", backlinks)
	assert.NotEmpty(t, backlinks, "Expected at least 1 backlink to 'Note Two'")

	// Test 5: Query functions
	mainFuncs, err := client.GetFunctions(ctx, "main")
	assert.NoError(t, err, "GetFunctions failed")
	assert.NotEmpty(t, mainFuncs, "Expected to find 'main' function")
	t.Logf("'main' function locations: %v", mainFuncs)

	// Test 6: Query classes/structs
	configClasses, err := client.GetClasses(ctx, "Config")
	assert.NoError(t, err, "GetClasses failed")
	assert.NotEmpty(t, configClasses, "Expected to find 'Config' struct")
	t.Logf("'Config' struct locations: %v", configClasses)
}

// TestDumpModeGeneration tests the dump mode workflow
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
	err := os.WriteFile(testFile, []byte(content), 0644)
	require.NoError(t, err, "Failed to write test file")

	meta, err := parser.ParseMarkdown(testFile)
	require.NoError(t, err, "ParseMarkdown failed")

	// Verify parsing worked
	assert.Len(t, meta.Tags, 2, "Expected 2 tags")
	assert.Len(t, meta.Wikilinks, 1, "Expected 1 wikilink")

	// Upsert in dump mode - this writes to buffer instead of DB
	err = client.UpsertNote(ctx, meta, "dump-test")
	assert.NoError(t, err, "UpsertNote in dump mode failed")

	// Verify dump output contains expected queries
	output := buf.String()
	t.Logf("Dump output length: %d bytes", len(output))

	assert.NotEmpty(t, output, "Dump output should not be empty")
	assert.Contains(t, output, "GRAPH.QUERY", "Dump output should contain GRAPH.QUERY commands")
	assert.Contains(t, output, "MERGE", "Dump output should contain MERGE commands")
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
	assert.NoError(t, err, "DeleteNote failed")

	// Verify it's gone
	time.Sleep(50 * time.Millisecond)
	stats2, _, _, _, _, _, _ := client.GetFullStats(ctx)
	t.Logf("Notes after delete: %d", stats2)

	assert.Less(t, stats2, stats1, "Note count should decrease after delete")
}

// TestConfigIntegration tests that config properly connects to DB
func TestConfigIntegration(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg = cfg.FromEnv()

	// Verify database config
	assert.NotEmpty(t, cfg.Database.Addr, "Database address should not be empty")
	assert.NotEmpty(t, cfg.Database.Graph, "Database graph should not be empty")

	t.Logf("Config: addr=%s, graph=%s", cfg.Database.Addr, cfg.Database.Graph)

	// Try to connect
	client, err := db.NewClient(cfg.Database.Addr, cfg.Database.Graph+"_configtest")
	if err != nil {
		t.Skipf("Cannot connect to FalkorDB: %v", err)
	}

	ctx := context.Background()
	// Simple query to verify connection
	_, err = client.Query(ctx, "RETURN 1")
	assert.NoError(t, err, "Query failed")
}

// TestErrorHandling covers edge cases and error conditions
func TestErrorHandling(t *testing.T) {
	ctx := context.Background()

	t.Run("Invalid Connection", func(t *testing.T) {
		// Use invalid port
		client, err := db.NewClient("localhost:9999", "invalid_test")
		// db.NewClient ignores Ping errors, and InitSchema ignores query errors.
		// We must try a direct query to verify failure.
		if err == nil {
			_, err = client.Query(ctx, "RETURN 1")
		}
		assert.Error(t, err, "Should fail to query with invalid address")
	})

	t.Run("Missing File", func(t *testing.T) {
		_, err := parser.ParseMarkdown("/non/existent/path/file.md")
		assert.Error(t, err, "Should fail to parse missing file")
	})

	t.Run("Invalid Markdown Content", func(t *testing.T) {
		// Although parser is robust, we check basic behavior for empty files
		tmpDir := t.TempDir()
		path := filepath.Join(tmpDir, "empty.md")
		os.WriteFile(path, []byte(""), 0644)

		meta, err := parser.ParseMarkdown(path)
		assert.NoError(t, err, "Empty file should parse without error")
		assert.Equal(t, "empty", meta.Name, "Empty file should have name based on filename")
	})

	t.Run("Upsert Valid Data", func(t *testing.T) {
		client := getTestClient(t)
		// We verify it handles valid data correctly as a baseline
		tmpDir := t.TempDir()
		path := filepath.Join(tmpDir, "valid.md")
		os.WriteFile(path, []byte("# Valid"), 0644)
		meta, _ := parser.ParseMarkdown(path)

		err := client.UpsertNote(ctx, meta, "test-project")
		assert.NoError(t, err, "Should handle valid metadata")
	})

	t.Run("Query Invalid Syntax", func(t *testing.T) {
		client := getTestClient(t)
		_, err := client.Query(ctx, "INVALID CYPHER QUERY")
		assert.Error(t, err, "Should fail on invalid Cypher query")
	})
}
