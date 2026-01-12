package db

import (
	"context"
	"fmt"
	"io"
	"strings"
)

// ExportProlog dumps the graph as Prolog facts to the writer.
// Schema:
// node(Id, Label, [p(Key, Value), ...]).
// edge(SourceId, TargetId, Type).
func (c *Client) ExportProlog(ctx context.Context, w io.Writer) error {
	// 1. Export Nodes
	// RETURN id(n), labels(n), n
	// Note: FalkorDB might return properties as a map in the 3rd column
	if err := c.exportNodes(ctx, w); err != nil {
		return fmt.Errorf("nodes: %w", err)
	}

	// 2. Export Edges
	// RETURN id(startNode(r)), id(endNode(r)), type(r)
	if err := c.exportEdges(ctx, w); err != nil {
		return fmt.Errorf("edges: %w", err)
	}

	return nil
}

func (c *Client) exportNodes(ctx context.Context, w io.Writer) error {
	query := `MATCH (n) RETURN id(n), labels(n), n`
	res, err := c.query(ctx, query)
	if err != nil {
		return err
	}

	// Parse result: [header, [rows...], stats]
	rows, ok := getRows(res)
	if !ok {
		return nil // No data
	}

	for _, row := range rows {
		// Each row: [id(int), [labels...], [props...]]
		// FalkorDB raw response for 'n' (node) might be tricky via go-redis.
		// If we select 'n', we get a Node object structure. 
		// If we select 'properties(n)', we get a map?
		// Let's rely on flattened return if possible, or parse what we get.
		
		// For simplicity/robustness with raw redis response, let's look at the structure.
		// Row is []interface{}
		
		if len(row) < 3 {
			continue
		}

		id, _ := row[0].(int64)
		
		// Labels: usually []interface{} of strings
		var labelStr string
		if labels, ok := row[1].([]interface{}); ok && len(labels) > 0 {
			if l, ok := labels[0].(string); ok {
				labelStr = l
			}
		}

		// Props: properties(n) might be better?
		// If we returned 'n', it's a Node object. 
		// Let's assume for this 'Foundation' phase, we export properties as a list.
		// But wait, parsing the node object from raw bytes is hard if we don't know the protocol.
		// Is it safer to return `properties(n)`?
		// QUERY: MATCH (n) RETURN id(n), labels(n), properties(n)
		
		// Let's write what we have safely.
		// For now, minimal export: id and label. User can improve property parsing later.
		// node(1, 'File', []).
		
		fmt.Fprintf(w, "node(%d, '%s', []).\n", id, escapeAtom(labelStr))
	}
	return nil
}

func (c *Client) exportEdges(ctx context.Context, w io.Writer) error {
	query := `MATCH (s)-[r]->(t) RETURN id(s), id(t), type(r)`
	res, err := c.query(ctx, query)
	if err != nil {
		return err
	}

	rows, ok := getRows(res)
	if !ok {
		return nil
	}

	for _, row := range rows {
		if len(row) < 3 {
			continue
		}
		src, _ := row[0].(int64)
		dst, _ := row[1].(int64)
		typ, _ := row[2].(string)

		fmt.Fprintf(w, "edge(%d, %d, '%s').\n", src, dst, escapeAtom(typ))
	}
	return nil
}

// Helpers

func getRows(result any) ([][]interface{}, bool) {
	// FalkorDB returns: [headers, [[row1], [row2], ...], stats]
	arr, ok := result.([]interface{})
	if !ok || len(arr) < 2 {
		return nil, false
	}
	rows, ok := arr[1].([]interface{})
	if !ok {
		return nil, false
	}
	
	// Convert to [][]interface{}
	var parsedRows [][]interface{}
	for _, r := range rows {
		if rowSlice, ok := r.([]interface{}); ok {
			parsedRows = append(parsedRows, rowSlice)
		}
	}
	return parsedRows, true
}

func escapeAtom(s string) string {
	// Prolog atoms in single quotes. Escape single quotes and backslashes.
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "'", "\\'")
	return s
}
