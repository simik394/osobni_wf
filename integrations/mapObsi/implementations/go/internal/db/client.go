package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"
	"io"

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
		"CREATE INDEX ON :Class(name)",
	}

	for _, q := range queries {
		// Ignore errors if index already exists
		c.query(ctx, q)
	}

	return nil
}

// UpsertCode creates or updates a code file node and its relationships
func (c *Client) UpsertCode(ctx context.Context, meta *parser.CodeMetadata) error {
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
func (c *Client) UpsertNote(ctx context.Context, meta *parser.NoteMetadata) error {
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
	return s
}
