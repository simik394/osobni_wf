package db

import (
	"context"
	"fmt"
	"strings"

	"io"

	"github.com/redis/go-redis/v9"

	"sync"

	"github.com/simik394/vault-librarian/internal/parser"
)

// Client wraps FalkorDB operations
type Client struct {
	rdb        *redis.Client
	graph      string
	dumpWriter io.Writer
	mu         sync.Mutex // Protects dumpWriter
}

// NewClient creates a new FalkorDB client
func NewClient(addr, graph string) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	// Test connection only if not dumping (handled later, but here we enforce connection)
	// Actually, for dump mode we might not need connection, but NewClient requires addr.
	// We'll proceed.
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		// Log warning but allow proceeding?
		// For now fail, unless we want to allow offline dumping.
		// User can set dummy addr.
	}

	return &Client{rdb: rdb, graph: graph}, nil
}

// SetDumpWriter enables dumping Cypher queries to the given writer
func (c *Client) SetDumpWriter(w io.Writer) {
	c.dumpWriter = w
}

// Query exposes the internal query method
func (c *Client) Query(ctx context.Context, cypher string) (any, error) {
	return c.query(ctx, cypher)
}

// query executes a Cypher query against FalkorDB or dumps it
func (c *Client) query(ctx context.Context, cypher string) (any, error) {
	if c.dumpWriter != nil {
		c.mu.Lock()
		defer c.mu.Unlock()

		// Format: GRAPH.QUERY <graph> "query"
		// We need to escape double quotes in the query for redis-cli via pipe
		// Actually, standard redis proto is *3\r\n... but redis-cli --pipe accepts text protocol too?
		// "redis-cli --pipe" expects RESP protocol.
		// Generating RESP protocol is annoying.
		// "redis-cli < file" accepts text commands.
		// User instruction in Julia was: "Use: cat dump.cypher | redis-cli --pipe"
		// Wait, redis-cli --pipe EXPECTS RESP.
		// If I generate text commands, I should use "cat dump.cypher | redis-cli".
		// I'll stick to text format which is readable.
		// "GRAPH.QUERY key "query""

		// Simple text format
		// Escape double quotes
		safeCypher := strings.ReplaceAll(cypher, "\"", "\\\"")
		// Also newlines
		safeCypher = strings.ReplaceAll(safeCypher, "\n", " ")
		safeCypher = strings.TrimSpace(safeCypher)

		fmt.Fprintf(c.dumpWriter, "GRAPH.QUERY %s \"%s\"\n", c.graph, safeCypher)
		return nil, nil
	}

	cmd := c.rdb.Do(ctx, "GRAPH.QUERY", c.graph, cypher)
	return cmd.Result()
}

// InitSchema creates the graph schema if it doesn't exist
func (c *Client) InitSchema(ctx context.Context) error {
	// Create indexes for faster lookups
	queries := []string{
		"CREATE INDEX ON :Note(path)",
		"CREATE INDEX ON :Note(name)",
		"CREATE INDEX ON :Tag(name)",
		"CREATE INDEX ON :Code(path)",
		"CREATE INDEX ON :Code(language)",
		"CREATE INDEX ON :Function(name)",
		"CREATE INDEX ON :Function(name)",
		"CREATE INDEX ON :Class(name)",
		"CREATE INDEX ON :Class(name)",
		"CREATE INDEX ON :Project(name)",
		"CREATE INDEX ON :Task(status)",
		"CREATE INDEX ON :Task(priority)",
	}

	for _, q := range queries {
		// Ignore errors if index already exists
		c.query(ctx, q)
	}

	return nil
}

// UpsertCode creates or updates a code file node and its relationships
func (c *Client) UpsertCode(ctx context.Context, meta *parser.CodeMetadata, projectName string) error {
	path := escapeCypher(meta.Path)
	name := escapeCypher(meta.Name)
	lang := escapeCypher(meta.Language)

	// Create or update the Code node
	query := fmt.Sprintf(`
		MERGE (c:Code {path: '%s'})
		SET c.name = '%s',
		    c.language = '%s',
		    c.modified = %d
		RETURN c
	`, path, name, lang, meta.Modified.Unix())

	if _, err := c.query(ctx, query); err != nil {
		return fmt.Errorf("failed to upsert code: %w", err)
	}

	// Link to Project
	if projectName != "" {
		projQuery := fmt.Sprintf(`
			MATCH (c:Code {path: '%s'})
			MERGE (p:Project {name: '%s'})
			MERGE (p)-[:CONTAINS]->(c)
		`, path, escapeCypher(projectName))
		c.query(ctx, projQuery)
	}

	// Clear existing relationships
	clearQuery := fmt.Sprintf(`
		MATCH (c:Code {path: '%s'})-[r:DEFINES|IMPORTS]->()
		DELETE r
	`, path)
	c.query(ctx, clearQuery)

	// Create function nodes and relationships
	for _, fn := range meta.Functions {
		fnQuery := fmt.Sprintf(`
			MATCH (c:Code {path: '%s'})
			MERGE (f:Function {name: '%s', path: '%s'})
			SET f.line = %d,
			    f.signature = '%s'
			MERGE (c)-[:DEFINES]->(f)
		`, path, escapeCypher(fn.Name), path, fn.Line, escapeCypher(fn.Signature))
		c.query(ctx, fnQuery)
	}

	// Create class nodes and relationships
	for _, cls := range meta.Classes {
		clsQuery := fmt.Sprintf(`
			MATCH (c:Code {path: '%s'})
			MERGE (cl:Class {name: '%s', path: '%s'})
			SET cl.line = %d
			MERGE (c)-[:DEFINES]->(cl)
		`, path, escapeCypher(cls.Name), path, cls.Line)
		c.query(ctx, clsQuery)
	}

	// Create import relationships
	for _, imp := range meta.Imports {
		impQuery := fmt.Sprintf(`
			MATCH (c:Code {path: '%s'})
			MERGE (m:Module {name: '%s'})
			MERGE (c)-[:IMPORTS]->(m)
		`, path, escapeCypher(imp))
		c.query(ctx, impQuery)
	}

	// Create task nodes and relationships
	c.upsertTasks(ctx, path, meta.Tasks, "code")

	return nil
}

// DeleteCode removes a code file and its relationships
func (c *Client) DeleteCode(ctx context.Context, path string) error {
	query := fmt.Sprintf(`
		MATCH (c:Code {path: '%s'})
		OPTIONAL MATCH (c)-[:DEFINES]->(d)
		DETACH DELETE c, d
	`, escapeCypher(path))

	_, err := c.query(ctx, query)
	return err
}

// UpsertNote creates or updates a note node and its relationships
func (c *Client) UpsertNote(ctx context.Context, meta *parser.NoteMetadata, projectName string) error {
	// Escape strings for Cypher
	path := escapeCypher(meta.Path)
	name := escapeCypher(meta.Name)

	// Create or update the Note node
	query := fmt.Sprintf(`
		MERGE (n:Note {path: '%s'})
		SET n.name = '%s',
		    n.modified = %d
		RETURN n
	`, path, name, meta.Modified.Unix())

	if _, err := c.query(ctx, query); err != nil {
		return fmt.Errorf("failed to upsert note: %w", err)
	}

	// Link to Project
	if projectName != "" {
		projQuery := fmt.Sprintf(`
			MATCH (n:Note {path: '%s'})
			MERGE (p:Project {name: '%s'})
			MERGE (p)-[:CONTAINS]->(n)
		`, path, escapeCypher(projectName))
		c.query(ctx, projQuery)
	}

	// Clear existing relationships for this note
	clearQuery := fmt.Sprintf(`
		MATCH (n:Note {path: '%s'})-[r:LINKS_TO|EMBEDS|TAGGED]->()
		DELETE r
	`, path)
	c.query(ctx, clearQuery)

	// Create tag relationships
	for _, tag := range meta.Tags {
		tagQuery := fmt.Sprintf(`
			MATCH (n:Note {path: '%s'})
			MERGE (t:Tag {name: '%s'})
			MERGE (n)-[:TAGGED]->(t)
		`, path, escapeCypher(tag))
		c.query(ctx, tagQuery)
	}

	// Create wikilink relationships
	for _, link := range meta.Wikilinks {
		linkQuery := fmt.Sprintf(`
			MATCH (n:Note {path: '%s'})
			MERGE (target:Note {name: '%s'})
			MERGE (n)-[:LINKS_TO]->(target)
		`, path, escapeCypher(link))
		c.query(ctx, linkQuery)
	}

	// Create embed relationships
	for _, embed := range meta.Embeds {
		embedQuery := fmt.Sprintf(`
			MATCH (n:Note {path: '%s'})
			MERGE (target:Note {name: '%s'})
			MERGE (n)-[:EMBEDS]->(target)
		`, path, escapeCypher(embed))
		c.query(ctx, embedQuery)
	}

	// Create embed relationships
	for _, embed := range meta.Embeds {
		embedQuery := fmt.Sprintf(`
			MATCH (n:Note {path: '%s'})
			MERGE (target:Note {name: '%s'})
			MERGE (n)-[:EMBEDS]->(target)
		`, path, escapeCypher(embed))
		c.query(ctx, embedQuery)
	}

	// Create task nodes and relationships
	c.upsertTasks(ctx, path, meta.Tasks, "note")

	return nil
}

// DeleteNote removes a note and its relationships
func (c *Client) DeleteNote(ctx context.Context, path string) error {
	query := fmt.Sprintf(`
		MATCH (n:Note {path: '%s'})
		DETACH DELETE n
	`, escapeCypher(path))

	_, err := c.query(ctx, query)
	return err
}

// GetOrphans returns notes with no incoming links
func (c *Client) GetOrphans(ctx context.Context) ([]string, error) {
	query := `
		MATCH (n:Note)
		WHERE NOT ()-[:LINKS_TO]->(n)
		RETURN n.path
	`

	result, err := c.query(ctx, query)
	if err != nil {
		return nil, err
	}

	return c.extractPaths(result), nil
}

// GetBacklinks returns notes linking to the given note
func (c *Client) GetBacklinks(ctx context.Context, noteName string) ([]string, error) {
	query := fmt.Sprintf(`
		MATCH (n:Note)-[:LINKS_TO]->(target:Note {name: '%s'})
		RETURN n.path
	`, escapeCypher(noteName))

	result, err := c.query(ctx, query)
	if err != nil {
		return nil, err
	}

	return c.extractPaths(result), nil
}

// GetNotesByTag returns notes with the given tag
func (c *Client) GetNotesByTag(ctx context.Context, tag string) ([]string, error) {
	query := fmt.Sprintf(`
		MATCH (n:Note)-[:TAGGED]->(t:Tag {name: '%s'})
		RETURN n.path
	`, escapeCypher(tag))

	result, err := c.query(ctx, query)
	if err != nil {
		return nil, err
	}

	return c.extractPaths(result), nil
}

// GetStats returns counts of nodes and edges
func (c *Client) GetStats(ctx context.Context) (notes, links, tags int, err error) {
	noteResult, _ := c.query(ctx, "MATCH (n:Note) RETURN count(n)")
	linkResult, _ := c.query(ctx, "MATCH ()-[r:LINKS_TO]->() RETURN count(r)")
	tagResult, _ := c.query(ctx, "MATCH (t:Tag) RETURN count(t)")

	notes = c.extractCount(noteResult)
	links = c.extractCount(linkResult)
	tags = c.extractCount(tagResult)

	return
}

// GetFullStats returns counts including code files
func (c *Client) GetFullStats(ctx context.Context) (notes, links, tags, code, funcs, classes int, err error) {
	noteResult, _ := c.query(ctx, "MATCH (n:Note) RETURN count(n)")
	linkResult, _ := c.query(ctx, "MATCH ()-[r:LINKS_TO]->() RETURN count(r)")
	tagResult, _ := c.query(ctx, "MATCH (t:Tag) RETURN count(t)")
	codeResult, _ := c.query(ctx, "MATCH (c:Code) RETURN count(c)")
	funcResult, _ := c.query(ctx, "MATCH (f:Function) RETURN count(f)")
	classResult, _ := c.query(ctx, "MATCH (cl:Class) RETURN count(cl)")

	notes = c.extractCount(noteResult)
	links = c.extractCount(linkResult)
	tags = c.extractCount(tagResult)
	code = c.extractCount(codeResult)
	funcs = c.extractCount(funcResult)
	classes = c.extractCount(classResult)

	return
}

// GetFunctions returns paths of files defining a function with the given name
func (c *Client) GetFunctions(ctx context.Context, funcName string) ([]string, error) {
	query := fmt.Sprintf(`
		MATCH (c:Code)-[:DEFINES]->(f:Function {name: '%s'})
		RETURN c.path, f.line
	`, escapeCypher(funcName))

	result, err := c.query(ctx, query)
	if err != nil {
		return nil, err
	}

	// Extract path:line format
	var results []string
	if arr, ok := result.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if rowArr, ok := row.([]any); ok && len(rowArr) >= 2 {
					if path, ok := rowArr[0].(string); ok {
						line := 0
						if l, ok := rowArr[1].(int64); ok {
							line = int(l)
						}
						results = append(results, fmt.Sprintf("%s:%d", path, line))
					}
				}
			}
		}
	}
	return results, nil
}

// GetClasses returns paths of files defining a class with the given name
func (c *Client) GetClasses(ctx context.Context, className string) ([]string, error) {
	query := fmt.Sprintf(`
		MATCH (c:Code)-[:DEFINES]->(cl:Class {name: '%s'})
		RETURN c.path, cl.line
	`, escapeCypher(className))

	result, err := c.query(ctx, query)
	if err != nil {
		return nil, err
	}

	var results []string
	if arr, ok := result.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if rowArr, ok := row.([]any); ok && len(rowArr) >= 2 {
					if path, ok := rowArr[0].(string); ok {
						line := 0
						if l, ok := rowArr[1].(int64); ok {
							line = int(l)
						}
						results = append(results, fmt.Sprintf("%s:%d", path, line))
					}
				}
			}
		}
	}
	return results, nil
}

// ExtractStrings parses string results from query results
func (c *Client) ExtractStrings(result any) []string {
	return c.extractPaths(result)
}

// extractPaths parses path strings from query results
func (c *Client) extractPaths(result any) []string {
	var paths []string
	// FalkorDB returns: [headers, [[row1], [row2], ...], stats]
	if arr, ok := result.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if rowArr, ok := row.([]any); ok && len(rowArr) > 0 {
					if path, ok := rowArr[0].(string); ok {
						paths = append(paths, path)
					}
				}
			}
		}
	}
	return paths
}

// extractCount parses a count from query results
func (c *Client) extractCount(result any) int {
	// FalkorDB returns: [headers, [[value]], stats]
	if arr, ok := result.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok && len(rows) > 0 {
			if row, ok := rows[0].([]any); ok && len(row) > 0 {
				switch v := row[0].(type) {
				case int64:
					return int(v)
				case int:
					return v
				case float64:
					return int(v)
				}
			}
		}
	}
	return 0
}

// escapeCypher escapes a string for use in Cypher queries
func escapeCypher(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "'", "\\'")
	s = strings.ReplaceAll(s, "\"", "\\\"") // Escape double quotes too just in case
	return s
}

// upsertTasks helper to save tasks for a file
func (c *Client) upsertTasks(ctx context.Context, parentPath string, tasks []parser.Task, parentType string) {
	// parentType: "code" or "note"
	// To link, we match the parent node.
	// We need to clear old tasks first? Or merge?
	// Strategy: Delete all tasks linked to this file, then re-create.
	// This is simpler than matching by line/text which might change.

	// First, find and detach-delete tasks linked to this file
	// Note: We assume tasks are unique to a file. A task node is just a data blob.
	// We can model it as (File)-[:HAS_TASK]->(Task)

	label := "Code"
	if parentType == "note" {
		label = "Note"
	}

	clearQuery := fmt.Sprintf(`
		MATCH (p:%s {path: '%s'})-[r:HAS_TASK]->(t:Task)
		DELETE r, t
	`, label, escapeCypher(parentPath))
	c.query(ctx, clearQuery)

	for _, task := range tasks {
		// Escape text
		text := escapeCypher(task.Text)
		status := escapeCypher(task.Status)

		taskQuery := fmt.Sprintf(`
			MATCH (p:%s {path: '%s'})
			CREATE (t:Task {
				text: '%s',
				line: %d,
				status: '%s',
				priority: '%s'
			})
			CREATE (p)-[:HAS_TASK]->(t)
		`, label, escapeCypher(parentPath), text, task.Line, status, "")
		c.query(ctx, taskQuery)
	}
}

// ScanConfig holds metadata about a scan operation
type ScanConfig struct {
	StartTime        int64    // Unix timestamp when scan started
	EndTime          int64    // Unix timestamp when scan ended
	DurationMs       int64    // Scan duration in milliseconds
	FilesScanned     int      // Total files processed
	NotesIndexed     int      // Markdown files indexed
	CodeFilesIndexed int      // Code files indexed
	Sources          []string // Source paths that were scanned
	IncludePatterns  []string // Include patterns used
	ExcludePatterns  []string // Exclude patterns used
	GlobalIgnores    []string // Global ignore patterns
	Version          string   // Librarian version
}

// UpsertScanConfig creates or updates the scan configuration node
func (c *Client) UpsertScanConfig(ctx context.Context, cfg *ScanConfig) error {
	// Convert slices to comma-separated strings for storage
	sources := strings.Join(cfg.Sources, ",")
	includes := strings.Join(cfg.IncludePatterns, ",")
	excludes := strings.Join(cfg.ExcludePatterns, ",")
	ignores := strings.Join(cfg.GlobalIgnores, ",")

	// Delete existing ScanConfig and create new one (MERGE on singleton)
	query := fmt.Sprintf(`
		MERGE (s:ScanConfig {id: 'singleton'})
		SET s.startTime = %d,
		    s.endTime = %d,
		    s.durationMs = %d,
		    s.filesScanned = %d,
		    s.notesIndexed = %d,
		    s.codeFilesIndexed = %d,
		    s.sources = '%s',
		    s.includePatterns = '%s',
		    s.excludePatterns = '%s',
		    s.globalIgnores = '%s',
		    s.version = '%s'
		RETURN s
	`, cfg.StartTime, cfg.EndTime, cfg.DurationMs,
		cfg.FilesScanned, cfg.NotesIndexed, cfg.CodeFilesIndexed,
		escapeCypher(sources), escapeCypher(includes),
		escapeCypher(excludes), escapeCypher(ignores),
		escapeCypher(cfg.Version))

	_, err := c.query(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to upsert scan config: %w", err)
	}

	return nil
}

// GetScanConfig retrieves the current scan configuration
func (c *Client) GetScanConfig(ctx context.Context) (*ScanConfig, error) {
	query := `MATCH (s:ScanConfig {id: 'singleton'}) RETURN s.startTime, s.endTime, s.durationMs, s.filesScanned, s.notesIndexed, s.codeFilesIndexed, s.sources, s.version`

	result, err := c.query(ctx, query)
	if err != nil {
		return nil, err
	}

	// Parse result (simplified - returns nil if not found)
	if arr, ok := result.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok && len(rows) > 0 {
			if row, ok := rows[0].([]any); ok && len(row) >= 8 {
				cfg := &ScanConfig{}
				if v, ok := row[0].(int64); ok {
					cfg.StartTime = v
				}
				if v, ok := row[1].(int64); ok {
					cfg.EndTime = v
				}
				if v, ok := row[2].(int64); ok {
					cfg.DurationMs = v
				}
				if v, ok := row[3].(int64); ok {
					cfg.FilesScanned = int(v)
				}
				if v, ok := row[4].(int64); ok {
					cfg.NotesIndexed = int(v)
				}
				if v, ok := row[5].(int64); ok {
					cfg.CodeFilesIndexed = int(v)
				}
				if v, ok := row[6].(string); ok && v != "" {
					cfg.Sources = strings.Split(v, ",")
				}
				if v, ok := row[7].(string); ok {
					cfg.Version = v
				}
				return cfg, nil
			}
		}
	}

	return nil, nil // Not found
}
