package export

import (
	"context"
	"fmt"
	"strings"

	"github.com/simik394/vault-librarian/internal/db"
)

// ExportPlantUML generates a PlantUML component diagram from the graph
func ExportPlantUML(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// Query for all nodes and relationships
	query := "MATCH (n)-[r]->(m) RETURN n.name, type(r), m.name, n.path"
	if scopePath != "" {
		query = fmt.Sprintf("MATCH (n)-[r]->(m) WHERE n.path IS NOT NULL AND n.path CONTAINS '%s' RETURN n.name, type(r), m.name, n.path", scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("@startuml\n")
	sb.WriteString("skinparam componentStyle rectangle\n")
	sb.WriteString("skinparam packageStyle frame\n\n")

	// Track seen nodes and packages to avoid duplicates
	seenNodes := make(map[string]bool)
	packages := make(map[string][]string) // package -> nodes

	// Track edges
	type edge struct {
		from, to, relType string
	}
	var edges []edge

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 3 {
					src, _ := r[0].(string)
					rel, _ := r[1].(string)
					dst, _ := r[2].(string)

					if src == "" || dst == "" {
						continue
					}

					// Deduplicate nodes
					seenNodes[src] = true
					seenNodes[dst] = true

					// Simple grouping logic for PlantUML:
					if strings.Contains(src, "/") {
						pkg := toPackage(src)
						if !hasNode(packages[pkg], src) {
							packages[pkg] = append(packages[pkg], src)
						}
					}
					if strings.Contains(dst, "/") {
						pkg := toPackage(dst)
						if !hasNode(packages[pkg], dst) {
							packages[pkg] = append(packages[pkg], dst)
						}
					}

					edges = append(edges, edge{src, dst, rel})
				}
			}
		}
	}

	// Write packages and components
	for pkg, nodes := range packages {
		if pkg == "" {
			for _, node := range nodes {
				sb.WriteString(fmt.Sprintf("component [%s]\n", node))
			}
			continue
		}
		sb.WriteString(fmt.Sprintf("package \"%s\" {\n", pkg))
		for _, node := range nodes {
			sb.WriteString(fmt.Sprintf("  component [%s]\n", node))
		}
		sb.WriteString("}\n\n")
	}

	// Write remaining top-level nodes
	for node := range seenNodes {
		isGrouped := false
		for _, nodes := range packages {
			if hasNode(nodes, node) {
				isGrouped = true
				break
			}
		}
		if !isGrouped {
			sb.WriteString(fmt.Sprintf("component [%s]\n", node))
		}
	}

	sb.WriteString("\n")

	// Write relationships
	for _, e := range edges {
		switch e.relType {
		case "IMPORTS":
			sb.WriteString(fmt.Sprintf("[%s] ..> [%s] : imports\n", e.from, e.to))
		case "DEFINES":
			sb.WriteString(fmt.Sprintf("[%s] +-- [%s] : defines\n", e.from, e.to))
		case "CALLS":
			sb.WriteString(fmt.Sprintf("[%s] --> [%s] : calls\n", e.from, e.to))
		default:
			sb.WriteString(fmt.Sprintf("[%s] --> [%s] : %s\n", e.from, e.to, e.relType))
		}
	}

	sb.WriteString("@enduml\n")
	return sb.String(), nil
}

func toPackage(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) > 1 {
		return parts[len(parts)-2]
	}
	return ""
}

func hasNode(slice []string, s string) bool {
	for _, item := range slice {
		if item == s {
			return true
		}
	}
	return false
}
