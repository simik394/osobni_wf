package export

import (
	"context"
	"fmt"
	"path/filepath"
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
			return strings.Join(parts[:len(parts)-1], "/")
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

// ExportMermaidClasses generates a Class Diagram in Mermaid format
func ExportMermaidClasses(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	var sb strings.Builder
	sb.WriteString("classDiagram\n")

	query := `MATCH (c:Code)-[:DEFINES]->(cls:Class) RETURN c.name, cls.name`
	if scopePath != "" {
		query = fmt.Sprintf(`MATCH (c:Code)-[:DEFINES]->(cls:Class) WHERE c.path CONTAINS '%s' RETURN c.name, cls.name`, scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 2 {
					// file, _ := r[0].(string)
					clsName, _ := r[1].(string)
					// Sanitize class name
					clsName = strings.ReplaceAll(clsName, " ", "_")
					clsName = strings.ReplaceAll(clsName, "-", "_")
					sb.WriteString(fmt.Sprintf("    class %s\n", clsName))
				}
			}
		}
	}

	// Add relationships if available in future

	return sb.String(), nil
}

// ExportMermaidPackages generates a high-level Package/Directory dependency graph
func ExportMermaidPackages(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	var sb strings.Builder
	sb.WriteString("graph TD\n")
	sb.WriteString("    %% Package/Directory Level Dependencies\n")

	// Helper to extract directory relative to root (or scope)
	toPackage := func(path string) string {
		dir := filepath.Dir(path)
		// For consistency with plantuml, let's use the same slash-based logic
		// or just use filepath.Dir and handle root.
		if dir == "." || dir == "" {
			return "root"
		}
		return dir
	}

	toID := func(name string) string {
		s := strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
				return r
			}
			return '_'
		}, name)
		return "PKG_" + s
	}

	// 1. Query all file-to-file imports
	query := `
		MATCH (a:Code)-[:IMPORTS]->(b)
		WHERE a.path IS NOT NULL
		RETURN a.path, b.path, b.name
	`
	if scopePath != "" {
		query = fmt.Sprintf(`
			MATCH (a:Code)-[:IMPORTS]->(b)
			WHERE a.path CONTAINS '%s'
			RETURN a.path, b.path, b.name
		`, scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	// Aggregate dependencies: SourcePkg -> DestPkg
	pkgDeps := make(map[string]map[string]bool)
	packages := make(map[string]bool)

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 3 {
					srcPath, _ := r[0].(string)
					dstPath, _ := r[1].(string)
					dstName, _ := r[2].(string)

					if !opts.ShouldInclude(srcPath) {
						continue
					}

					srcPkg := toPackage(srcPath)
					packages[srcPkg] = true

					var dstPkg string
					if dstPath != "" {
						dstPkg = toPackage(dstPath)
					} else {
						// External module
						if dstName != "" {
							parts := strings.Split(dstName, "/")
							if len(parts) > 0 {
								dstPkg = "ext_" + parts[0]
							} else {
								dstPkg = "ext_lib"
							}
						} else {
							continue
						}
					}

					if srcPkg == dstPkg || srcPkg == "" || dstPkg == "" {
						continue
					}

					// If dest is also project code, mark it
					if dstPath != "" {
						packages[dstPkg] = true
					}

					if pkgDeps[srcPkg] == nil {
						pkgDeps[srcPkg] = make(map[string]bool)
					}
					pkgDeps[srcPkg][dstPkg] = true
				}
			}
		}
	}

	// Render Nodes
	for pkg := range packages {
		sb.WriteString(fmt.Sprintf("    %s[\"%s\"]\n", toID(pkg), pkg))
	}

	// Render Edges
	for src, dests := range pkgDeps {
		for dst := range dests {
			if strings.HasPrefix(dst, "ext_") {
				// Style external links differently
				label := strings.TrimPrefix(dst, "ext_")
				sb.WriteString(fmt.Sprintf("    %s -.-> %s((\"%s\"))\n", toID(src), toID(dst), label))
			} else {
				sb.WriteString(fmt.Sprintf("    %s --> %s\n", toID(src), toID(dst)))
			}
		}
	}

	// Style
	sb.WriteString("    classDef default fill:#f9f9f9,stroke:#333,stroke-width:1px;\n")

	return sb.String(), nil
}

// ExportAlgorithmDiagram generates a meta-diagram explaining the clustering logic
func ExportAlgorithmDiagram() string {
	return `graph TD
    %% Meta-Diagram: How Clustering Works
    
    subgraph S1 ["1. Input Graph"]
        N1["auth.go (api/auth.go)"] --> N2["db.go (db/db.go)"]
        N2 --> N3["logger.go (utils/logger.go)"]
        N4["router.go (api/router.go)"] --> N1
    end

    subgraph S2 ["2. Cluster Identification"]
        N1:::clsAPI
        N4:::clsAPI
        N2:::clsDB
        N3:::clsUtils
    end

    subgraph S3 ["3. Frontier Detection"]
        direction TB
        subgraph C_API ["Cluster: api"]
            U1["router.go"] --> U2["auth.go"]
        end
        F1["db.go (db)"]:::frontier
        
        U2 -.-> F1
    end

    S1 ==> S2
    S2 ==> S3
    
    classDef clsAPI fill:#e1f5fe,stroke:#01579b;
    classDef clsDB fill:#fff3e0,stroke:#e65100;
    classDef clsUtils fill:#f1f8e9,stroke:#33691e;
    classDef frontier fill:#eee,stroke:#333,stroke-dasharray: 5 5;
    
    style S3 fill:#f9f9f9,stroke:#333,stroke-width:2px;
`
}
