package export

import (
	"context"
	"fmt"
	"strings"

	"github.com/simik394/vault-librarian/internal/db"
)

// ExportMermaid generates a Module Dependency Graph (Mermaid flowchart)
func ExportMermaid(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	var sb strings.Builder
	sb.WriteString("graph TD\n")
	sb.WriteString("    %% Module Structure with External Dependencies\n")

	// Helper to extract basename
	toBase := func(path string) string {
		parts := strings.Split(path, "/")
		return parts[len(parts)-1]
	}

	toDir := func(path string) string {
		parts := strings.Split(path, "/")
		if len(parts) > 1 {
			return parts[len(parts)-2]
		}
		return "root"
	}

	// Helper to sanitize for Mermaid (alphanumeric only for IDs)
	toID := func(name string) string {
		s := strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
				return r
			}
			return '_'
		}, name)
		return "N" + s
	}

	// Helper to check if import is external (not relative path)
	isExternal := func(importPath string) bool {
		return !strings.HasPrefix(importPath, ".") && !strings.HasPrefix(importPath, "/")
	}

	// Track unique edges and nodes
	edges := make(map[string]bool)
	type FileInfo struct {
		Name    string
		Path    string
		Symbols []string
	}
	files := make(map[string]*FileInfo)              // Path -> Info
	externalDeps := make(map[string]map[string]bool) // FilePath -> set of external deps

	// 1. Structural Relationships (DEFINES)
	if opts.Filter == FilterAll || opts.Filter == FilterInternal {
		queryDefines := "MATCH (c:Code)-[:DEFINES]->(s) WHERE c.path IS NOT NULL RETURN c.path, c.name, labels(s)[0], s.name"
		if scopePath != "" {
			queryDefines = fmt.Sprintf("MATCH (c:Code)-[:DEFINES]->(s) WHERE c.path CONTAINS '%s' RETURN c.path, c.name, labels(s)[0], s.name", scopePath)
		}

		resDefines, err := client.Query(ctx, queryDefines)
		if err == nil {
			if arr, ok := resDefines.([]any); ok && len(arr) > 1 {
				if rows, ok := arr[1].([]any); ok {
					for _, row := range rows {
						if r, ok := row.([]any); ok && len(r) >= 4 {
							filePath, _ := r[0].(string)
							fileName, _ := r[1].(string)
							symbolName, _ := r[3].(string)

							if !opts.ShouldInclude(filePath) {
								continue
							}

							if files[filePath] == nil {
								files[filePath] = &FileInfo{Name: fileName, Path: filePath}
								if files[filePath].Name == "" {
									files[filePath].Name = toBase(filePath)
								}
							}
							files[filePath].Symbols = append(files[filePath].Symbols, symbolName)
						}
					}
				}
			}
		}
	}

	// 2. Dependency Relationships (IMPORTS)
	if opts.Filter == FilterAll || opts.Filter == FilterExternal {
		queryImports := "MATCH (c:Code)-[r:IMPORTS]->(target:Module) WHERE c.path IS NOT NULL RETURN c.path, c.name, target.name"
		if scopePath != "" {
			queryImports = fmt.Sprintf("MATCH (c:Code)-[r:IMPORTS]->(target:Module) WHERE c.path CONTAINS '%s' RETURN c.path, c.name, target.name", scopePath)
		}

		resImports, err := client.Query(ctx, queryImports)
		if err == nil {
			if arr, ok := resImports.([]any); ok && len(arr) > 1 {
				if rows, ok := arr[1].([]any); ok {
					for _, row := range rows {
						if r, ok := row.([]any); ok && len(r) >= 3 {
							filePath, _ := r[0].(string)
							fileName, _ := r[1].(string)

							var importTarget string
							switch t := r[2].(type) {
							case string:
								importTarget = t
							case map[string]any:
								if name, ok := t["name"].(string); ok {
									importTarget = name
								}
							}

							if !opts.ShouldInclude(filePath) {
								continue
							}

							if files[filePath] == nil {
								files[filePath] = &FileInfo{Name: fileName, Path: filePath}
								if files[filePath].Name == "" {
									files[filePath].Name = toBase(filePath)
								}
							}

							if importTarget != "" && isExternal(importTarget) {
								if externalDeps[filePath] == nil {
									externalDeps[filePath] = make(map[string]bool)
								}
								parts := strings.Split(importTarget, "/")
								pkgName := parts[0]
								if pkgName != "" && pkgName != "." && pkgName != ".." {
									externalDeps[filePath][pkgName] = true
								}
							}
						}
					}
				}
			}
		}
	}

	// Group by Directory Structure
	dirs := make(map[string][]*FileInfo)
	for _, info := range files {
		d := toDir(info.Path)
		dirs[d] = append(dirs[d], info)
	}

	// Render
	for dirName, fileList := range dirs {
		sb.WriteString(fmt.Sprintf("    subgraph %s\n", toID("dir_"+dirName)))
		// sb.WriteString(fmt.Sprintf("        direction TB\n"))
		for _, info := range fileList {
			fileID := toID(info.Path) // Unique ID based on path

			// Show symbols if detail level is high/medium
			if opts.Detail == "high" || (opts.Detail == "medium" && len(info.Symbols) > 0) {
				sb.WriteString(fmt.Sprintf("        subgraph %s[\"%s\"]\n", fileID, info.Name))
				for i, sym := range info.Symbols {
					limit := 3
					if opts.Detail == "high" {
						limit = 8
					}

					if i >= limit {
						sb.WriteString(fmt.Sprintf("            %s_more[\"...+%d more\"]\n", fileID, len(info.Symbols)-limit))
						break
					}
					symID := toID(sym)
					sb.WriteString(fmt.Sprintf("            %s_%s[\"%s\"]\n", fileID, symID, sym))
				}
				sb.WriteString("        end\n")
			} else {
				// Just file node
				sb.WriteString(fmt.Sprintf("        %s[\"%s\"]\n", fileID, info.Name))
			}

			// Render Edges to External Deps
			if deps, ok := externalDeps[info.Path]; ok {
				for dep := range deps {
					depID := toID("EXT_" + dep)
					// Note: External nodes are typically outside subgraphs or in their own
					// We'll define them later, just link here
					edge := fmt.Sprintf("%s->%s", fileID, depID)
					if !edges[edge] {
						edges[edge] = true
						sb.WriteString(fmt.Sprintf("        %s -.-> %s((\"%s\"))\n", fileID, depID, dep))
					}
				}
			}
		}
		sb.WriteString("    end\n")
	}

	// Style
	sb.WriteString("    classDef external fill:#eee,stroke:#333,stroke-dasharray: 5 5\n")
	// sb.WriteString("    classDef file fill:#fff,stroke:#333\n")

	return sb.String(), nil
}
