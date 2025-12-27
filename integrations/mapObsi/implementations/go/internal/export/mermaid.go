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
	fileSymbols := make(map[string][]string)
	externalDeps := make(map[string]map[string]bool) // file -> set of external deps

	// 1. Query DEFINES relationships for user code structure
	queryDefines := "MATCH (c:Code)-[:DEFINES]->(s) WHERE c.path IS NOT NULL RETURN c.path, c.name, labels(s)[0], s.name"
	if scopePath != "" {
		queryDefines = fmt.Sprintf("MATCH (c:Code)-[:DEFINES]->(s) WHERE c.path CONTAINS '%s' RETURN c.path, c.name, labels(s)[0], s.name", scopePath)
	}

	resDefines, err := client.Query(ctx, queryDefines)
	if err != nil {
		return "", fmt.Errorf("failed to query definitions: %w", err)
	}

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

					if fileName == "" {
						fileName = toBase(filePath)
					}

					fileSymbols[fileName] = append(fileSymbols[fileName], symbolName)
				}
			}
		}
	}

	// 2. Query IMPORTS relationships to find external dependencies
	// Return target.name directly since Module nodes have a name property
	queryImports := "MATCH (c:Code)-[r:IMPORTS]->(target:Module) WHERE c.path IS NOT NULL RETURN c.path, c.name, target.name"
	if scopePath != "" {
		queryImports = fmt.Sprintf("MATCH (c:Code)-[r:IMPORTS]->(target:Module) WHERE c.path CONTAINS '%s' RETURN c.path, c.name, target.name", scopePath)
	}

	resImports, _ := client.Query(ctx, queryImports)
	if arr, ok := resImports.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 3 {
					filePath, _ := r[0].(string)
					fileName, _ := r[1].(string)

					// Target can be string or node
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

					if fileName == "" {
						fileName = toBase(filePath)
					}

					if importTarget != "" && isExternal(importTarget) {
						if externalDeps[fileName] == nil {
							externalDeps[fileName] = make(map[string]bool)
						}
						// Extract package name (first part of import path)
						parts := strings.Split(importTarget, "/")
						pkgName := parts[0]
						// Skip relative-looking paths
						if pkgName != "" && pkgName != "." && pkgName != ".." {
							externalDeps[fileName][pkgName] = true
						}
					}
				}
			}
		}
	}

	// 3. Generate Mermaid output based on detail level
	switch opts.Detail {
	case "high":
		// Show all: files, symbols, and external deps
		for fileName, symbols := range fileSymbols {
			fileID := toID(fileName)
			sb.WriteString(fmt.Sprintf("    subgraph %s[\"%s\"]\n", fileID, fileName))
			for i, sym := range symbols {
				if i >= 8 {
					sb.WriteString(fmt.Sprintf("        %s_more[\"...+%d more\"]\n", fileID, len(symbols)-8))
					break
				}
				symID := toID(sym)
				sb.WriteString(fmt.Sprintf("        %s_%s[\"%s\"]\n", fileID, symID, sym))
			}
			sb.WriteString("    end\n")

			// External deps for this file
			if deps, ok := externalDeps[fileName]; ok {
				for dep := range deps {
					depID := toID(dep)
					edge := fmt.Sprintf("%s->%s", fileID, depID)
					if !edges[edge] {
						edges[edge] = true
						sb.WriteString(fmt.Sprintf("    %s -.->|uses| EXT_%s((\"%s\"))\n", fileID, depID, dep))
					}
				}
			}
		}

	case "low":
		// Just files as nodes
		for fileName := range fileSymbols {
			fileID := toID(fileName)
			if !edges[fileID] {
				edges[fileID] = true
				sb.WriteString(fmt.Sprintf("    %s[\"%s\"]\n", fileID, fileName))
			}
		}

	default: // medium - files with limited symbols + external deps grouped
		// User code subgraphs
		sb.WriteString("    subgraph UserCode[\"📁 Your Code\"]\n")
		for fileName, symbols := range fileSymbols {
			fileID := toID(fileName)
			sb.WriteString(fmt.Sprintf("        subgraph %s[\"%s\"]\n", fileID, fileName))
			for i, sym := range symbols {
				if i >= 3 {
					sb.WriteString(fmt.Sprintf("            %s_more[\"...+%d more\"]\n", fileID, len(symbols)-3))
					break
				}
				symID := toID(sym)
				sb.WriteString(fmt.Sprintf("            %s_%s[\"%s\"]\n", fileID, symID, sym))
			}
			sb.WriteString("        end\n")
		}
		sb.WriteString("    end\n")

		// External dependencies grouped
		allExtDeps := make(map[string][]string) // dep -> files using it
		for fileName, deps := range externalDeps {
			for dep := range deps {
				allExtDeps[dep] = append(allExtDeps[dep], fileName)
			}
		}

		if len(allExtDeps) > 0 {
			sb.WriteString("    subgraph ExtDeps[\"📦 External Dependencies\"]\n")
			for dep := range allExtDeps {
				depID := toID(dep)
				sb.WriteString(fmt.Sprintf("        EXT_%s((\"%s\"))\n", depID, dep))
			}
			sb.WriteString("    end\n")

			// Draw edges from files to external deps
			for dep, files := range allExtDeps {
				depID := toID(dep)
				for _, fileName := range files {
					fileID := toID(fileName)
					edge := fmt.Sprintf("%s->%s", fileID, depID)
					if !edges[edge] {
						edges[edge] = true
						sb.WriteString(fmt.Sprintf("    %s -.-> EXT_%s\n", fileID, depID))
					}
				}
			}
		}
	}

	// Style external deps differently
	sb.WriteString("    classDef external fill:#e1f5fe,stroke:#0288d1,stroke-width:2px\n")
	sb.WriteString("    class ExtDeps external\n")

	// If empty, fallback
	if sb.Len() <= 100 {
		sb.WriteString("    Message[\"No code definitions found\"]\n")
	}

	return sb.String(), nil
}
