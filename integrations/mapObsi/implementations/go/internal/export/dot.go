package export

import (
	"context"
	"fmt"
	"strings"

	"github.com/simik394/vault-librarian/internal/db"
)

// ExportDOT generates a Graphviz DOT file from the graph
func ExportDOT(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// Query for all nodes and relationships
	// Use OPTIONAL filter on path to allow nodes without path (like Module)
	query := "MATCH (n)-[r]->(m) RETURN n.name, type(r), m.name, coalesce(n.path, '')"
	if scopePath != "" {
		// Filter ONLY source nodes that have a path in scope, but allow relationships to nodes without paths (like Module)
		query = fmt.Sprintf("MATCH (n)-[r]->(m) WHERE n.path IS NOT NULL AND n.path CONTAINS '%s' RETURN n.name, type(r), m.name, n.path", scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("digraph G {\n")
	sb.WriteString("    node [shape=box];\n")

	// Track edges to avoid duplicates in low detail mode
	edges := make(map[string]bool)

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 4 {
					src, _ := r[0].(string)
					rel, _ := r[1].(string)
					dst, _ := r[2].(string)
					path, _ := r[3].(string)

					// Apply exclusion filter
					if !opts.ShouldInclude(path) {
						continue
					}

					if src != "" && dst != "" {
						edge := fmt.Sprintf("%s->%s", src, dst)

						// In low detail, skip duplicate edges
						if opts.Detail == "low" && edges[edge] {
							continue
						}
						edges[edge] = true

						// In low detail, omit labels
						if opts.Detail == "low" {
							sb.WriteString(fmt.Sprintf("    \"%s\" -> \"%s\";\n", src, dst))
						} else {
							sb.WriteString(fmt.Sprintf("    \"%s\" -> \"%s\" [label=\"%s\"];\n", src, dst, rel))
						}
					}
				}
			}
		}
	}

	sb.WriteString("}\n")
	return sb.String(), nil
}
