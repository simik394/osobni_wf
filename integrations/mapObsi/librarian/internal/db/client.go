package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"
	"github.com/simik394/vault-librarian/internal/parser"
)

// Client wraps FalkorDB operations
type Client struct {
	rdb   *redis.Client
	graph string
}

// NewClient creates a new FalkorDB client
func NewClient(addr, graph string) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	// Test connection
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to FalkorDB: %w", err)
	}

	return &Client{rdb: rdb, graph: graph}, nil
}

// InitSchema creates the graph schema if it doesn't exist
func (c *Client) InitSchema(ctx context.Context) error {
	// Create indexes for faster lookups
	queries := []string{
		"CREATE INDEX ON :Note(path)",
		"CREATE INDEX ON :Note(name)",
		"CREATE INDEX ON :Tag(name)",
	}

	for _, q := range queries {
		// Ignore errors if index already exists
		c.query(ctx, q)
	}

	return nil
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

	// Parse results (simplified)
	notes = c.extractCount(noteResult)
	links = c.extractCount(linkResult)
	tags = c.extractCount(tagResult)

	return
}

// query executes a Cypher query against FalkorDB
func (c *Client) query(ctx context.Context, cypher string) (any, error) {
	cmd := c.rdb.Do(ctx, "GRAPH.QUERY", c.graph, cypher)
	return cmd.Result()
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
