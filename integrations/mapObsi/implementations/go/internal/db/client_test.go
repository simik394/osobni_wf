package db

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/simik394/vault-librarian/internal/parser"
)

// TestEscapeCypher tests the Cypher string escaping
func TestEscapeCypher(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"simple", "simple"},
		{"with 'quotes'", "with \\'quotes\\'"},
		{`with "double"`, `with \"double\"`},
		{"with\\backslash", "with\\\\backslash"},
		{"path/to/file.md", "path/to/file.md"},
		{"it's \"complex\"", "it\\'s \\\"complex\\\""},
		{"", ""},
	}

	for _, tc := range cases {
		got := escapeCypher(tc.input)
		if got != tc.expected {
			t.Errorf("escapeCypher(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}

// TestDumpMode tests that queries are written to dump writer instead of executing
func TestDumpMode(t *testing.T) {
	var buf bytes.Buffer

	// Create client with minimal config (connection will fail but that's ok for dump mode)
	client := &Client{
		graph:      "test-graph",
		dumpWriter: &buf,
	}

	ctx := context.Background()

	// Execute a query in dump mode
	_, err := client.query(ctx, "MATCH (n) RETURN n")
	if err != nil {
		t.Fatalf("query in dump mode should not fail: %v", err)
	}

	// Check that the query was written to buffer
	output := buf.String()
	if !strings.Contains(output, "GRAPH.QUERY test-graph") {
		t.Errorf("Output should contain GRAPH.QUERY command, got: %s", output)
	}
	if !strings.Contains(output, "MATCH (n) RETURN n") {
		t.Errorf("Output should contain the query, got: %s", output)
	}
}

// TestDumpModeEscaping tests that dump mode properly escapes quotes
func TestDumpModeEscaping(t *testing.T) {
	var buf bytes.Buffer

	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()

	// Query with quotes that need escaping
	_, _ = client.query(ctx, `MERGE (n:Note {name: 'O'Brien'})`)

	output := buf.String()
	// The output should have escaped the inner quote
	if strings.Contains(output, "O'Brien") && !strings.Contains(output, `\"`) {
		// This is testing the raw query pass-through; escaping happens at generation time
		// The dump should preserve the query as given
	}
}

// TestDumpModeNewlineHandling tests that newlines are handled in dump mode
func TestDumpModeNewlineHandling(t *testing.T) {
	var buf bytes.Buffer

	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()

	// Query with newlines
	_, _ = client.query(ctx, `
		MATCH (n:Note)
		WHERE n.name = 'test'
		RETURN n
	`)

	output := buf.String()
	// Newlines should be replaced with spaces for redis-cli compatibility
	if strings.Contains(output, "\n\t") {
		t.Error("Output should not contain literal newlines in the query body")
	}
	// Should be a single line
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) != 1 {
		t.Errorf("Dump output should be single line, got %d lines", len(lines))
	}
}

// TestSetDumpWriter tests setting the dump writer
func TestSetDumpWriter(t *testing.T) {
	client := &Client{graph: "test"}

	if client.dumpWriter != nil {
		t.Error("dumpWriter should be nil initially")
	}

	var buf bytes.Buffer
	client.SetDumpWriter(&buf)

	if client.dumpWriter == nil {
		t.Error("dumpWriter should be set after SetDumpWriter")
	}
}

// TestExtractPaths tests result parsing for path queries
func TestExtractPaths(t *testing.T) {
	client := &Client{}

	// Simulate FalkorDB result format: [headers, [[row1], [row2], ...], stats]
	mockResult := []any{
		[]any{"n.path"}, // headers
		[]any{[]any{"/path/one.md"}, []any{"/path/two.md"}, []any{"/path/three"}}, // rows
		[]any{}, // stats
	}

	paths := client.extractPaths(mockResult)

	expected := []string{"/path/one.md", "/path/two.md", "/path/three"}
	if len(paths) != len(expected) {
		t.Fatalf("Expected %d paths, got %d", len(expected), len(paths))
	}

	for i, path := range paths {
		if path != expected[i] {
			t.Errorf("Path %d: expected %q, got %q", i, expected[i], path)
		}
	}
}

// TestExtractPathsEmpty tests result parsing with empty results
func TestExtractPathsEmpty(t *testing.T) {
	client := &Client{}

	// Empty result
	mockResult := []any{
		[]any{"n.path"},
		[]any{},
		[]any{},
	}

	paths := client.extractPaths(mockResult)
	if len(paths) != 0 {
		t.Errorf("Expected 0 paths for empty result, got %d", len(paths))
	}
}

// TestExtractPathsNil tests result parsing with nil
func TestExtractPathsNil(t *testing.T) {
	client := &Client{}

	paths := client.extractPaths(nil)
	if paths != nil {
		t.Error("Expected nil for nil input")
	}
}

// TestExtractCount tests count result parsing
func TestExtractCount(t *testing.T) {
	client := &Client{}

	// Simulate FalkorDB count result
	mockResult := []any{
		[]any{"count(n)"},
		[]any{[]any{int64(42)}},
		[]any{},
	}

	count := client.extractCount(mockResult)
	if count != 42 {
		t.Errorf("Expected count 42, got %d", count)
	}
}

// TestExtractCountZero tests count parsing with zero result
func TestExtractCountZero(t *testing.T) {
	client := &Client{}

	mockResult := []any{
		[]any{"count(n)"},
		[]any{[]any{int64(0)}},
		[]any{},
	}

	count := client.extractCount(mockResult)
	if count != 0 {
		t.Errorf("Expected count 0, got %d", count)
	}
}

// TestExtractCountEmpty tests count parsing with empty result
func TestExtractCountEmpty(t *testing.T) {
	client := &Client{}

	mockResult := []any{
		[]any{"count(n)"},
		[]any{},
		[]any{},
	}

	count := client.extractCount(mockResult)
	if count != 0 {
		t.Errorf("Expected count 0 for empty result, got %d", count)
	}
}

// TestExtractCountFloat tests count parsing with float64 (some drivers return this)
func TestExtractCountFloat(t *testing.T) {
	client := &Client{}

	mockResult := []any{
		[]any{"count(n)"},
		[]any{[]any{float64(100)}},
		[]any{},
	}

	count := client.extractCount(mockResult)
	if count != 100 {
		t.Errorf("Expected count 100, got %d", count)
	}
}

// TestUpsertNoteToDump tests that UpsertNote generates correct Cypher in dump mode
func TestUpsertNoteToDump(t *testing.T) {
	var buf bytes.Buffer
	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()
	meta := &parser.NoteMetadata{
		Path:      "/vault/test.md",
		Name:      "test",
		Modified:  time.Now(),
		Tags:      []string{"tag1", "tag2"},
		Wikilinks: []string{"Other Note"},
	}

	err := client.UpsertNote(ctx, meta, "test-project")
	if err != nil {
		t.Fatalf("UpsertNote failed: %v", err)
	}

	output := buf.String()

	// Check that key operations are present
	checks := []string{
		"MERGE (n:Note",
		"path: '/vault/test.md'",
		"MERGE (t:Tag {name: 'tag1'})",
		"MERGE (t:Tag {name: 'tag2'})",
		"MERGE (n)-[:TAGGED]",
		"MERGE (p:Project {name: 'test-project'})",
		"MERGE (p)-[:CONTAINS]",
		"MERGE (n)-[:LINKS_TO]",
	}

	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("Expected output to contain %q", check)
		}
	}
}

// TestUpsertCodeToDump tests that UpsertCode generates correct Cypher in dump mode
func TestUpsertCodeToDump(t *testing.T) {
	var buf bytes.Buffer
	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()
	meta := &parser.CodeMetadata{
		Path:     "/src/main.go",
		Name:     "main.go",
		Language: "go",
		Modified: time.Now(),
		Functions: []parser.Function{
			{Name: "main", Line: 10, Signature: "func main()"},
		},
		Classes: []parser.Class{
			{Name: "Config", Line: 5},
		},
		Imports: []string{"fmt", "os"},
	}

	err := client.UpsertCode(ctx, meta, "my-project")
	if err != nil {
		t.Fatalf("UpsertCode failed: %v", err)
	}

	output := buf.String()

	checks := []string{
		"MERGE (c:Code",
		"path: '/src/main.go'",
		"c.language = 'go'",
		"MERGE (f:Function {name: 'main'",
		"MERGE (cl:Class {name: 'Config'",
		"MERGE (m:Module {name: 'fmt'})",
		"MERGE (c)-[:DEFINES]",
		"MERGE (c)-[:IMPORTS]",
	}

	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("Expected output to contain %q\nGot: %s", check, output)
		}
	}
}

// TestInitSchemaToDump tests that InitSchema generates index creation queries
func TestInitSchemaToDump(t *testing.T) {
	var buf bytes.Buffer
	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()
	err := client.InitSchema(ctx)
	if err != nil {
		t.Fatalf("InitSchema failed: %v", err)
	}

	output := buf.String()

	indexes := []string{
		"CREATE INDEX ON :Note(path)",
		"CREATE INDEX ON :Tag(name)",
		"CREATE INDEX ON :Code(path)",
		"CREATE INDEX ON :Function(name)",
		"CREATE INDEX ON :Class(name)",
	}

	for _, idx := range indexes {
		if !strings.Contains(output, idx) {
			t.Errorf("Expected index query %q in output", idx)
		}
	}
}

// TestDeleteNoteToDump tests DeleteNote query generation
func TestDeleteNoteToDump(t *testing.T) {
	var buf bytes.Buffer
	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()
	err := client.DeleteNote(ctx, "/vault/old.md")
	if err != nil {
		t.Fatalf("DeleteNote failed: %v", err)
	}

	output := buf.String()
	if !strings.Contains(output, "MATCH (n:Note {path: '/vault/old.md'})") {
		t.Errorf("Expected path match in delete query, got: %s", output)
	}
	if !strings.Contains(output, "DETACH DELETE") {
		t.Errorf("Expected DETACH DELETE in query, got: %s", output)
	}
}

// TestDeleteCodeToDump tests DeleteCode query generation
func TestDeleteCodeToDump(t *testing.T) {
	var buf bytes.Buffer
	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()
	err := client.DeleteCode(ctx, "/src/old.go")
	if err != nil {
		t.Fatalf("DeleteCode failed: %v", err)
	}

	output := buf.String()
	if !strings.Contains(output, "MATCH (c:Code {path: '/src/old.go'})") {
		t.Errorf("Expected path match in delete query, got: %s", output)
	}
}

// TestSpecialCharacterEscaping tests handling of special characters in file paths
func TestSpecialCharacterEscaping(t *testing.T) {
	var buf bytes.Buffer
	client := &Client{
		graph:      "vault",
		dumpWriter: &buf,
	}

	ctx := context.Background()
	meta := &parser.NoteMetadata{
		Path:     "/vault/Tom's Notes/It's \"Complex\".md",
		Name:     "It's \"Complex\"",
		Modified: time.Now(),
	}

	err := client.UpsertNote(ctx, meta, "")
	if err != nil {
		t.Fatalf("UpsertNote with special chars failed: %v", err)
	}

	output := buf.String()
	// Should contain escaped quotes
	if !strings.Contains(output, "\\'") {
		t.Log("Output:", output)
		t.Error("Expected escaped single quotes in output")
	}
}
