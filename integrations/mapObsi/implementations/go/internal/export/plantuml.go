package export

import (
	"context"
	"fmt"
	"strings"

	"github.com/simik394/vault-librarian/internal/db"
)

// ExportPlantUML generates multiple PlantUML diagrams
func ExportPlantUML(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (map[string]string, error) {
	results := make(map[string]string)

	// 1. Architecture / Component Diagram
	if comp, err := exportComponentDiagram(ctx, client, scopePath, opts); err == nil && comp != "" {
		results["architecture.puml"] = comp
	}

	// 2. High-level Package Diagram
	if pkg, err := exportPackageDiagram(ctx, client, scopePath, opts); err == nil && pkg != "" {
		results["packages.puml"] = pkg
	}

	// 3. Class Relationship Diagram
	if cls, err := exportClassDiagram(ctx, client, scopePath, opts); err == nil && cls != "" {
		results["classes.puml"] = cls
	}

	// 4. File Dependency Graph (Replaces Mermaid for complexity)
	if deps, err := exportDependencyDiagram(ctx, client, scopePath, opts); err == nil && deps != "" {
		results["dependencies.puml"] = deps
	}

	return results, nil
}

func exportComponentDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// ... (content same as before, simplified for this snippet if needed, but keeping existing logic here is fine)
	// Actually, I'll keep the existing exportComponentDiagram logic but maybe rename title?
	// For brevity in this replace block, I am keeping the logic roughly same but just ensuring it compiles.
	// Since I am replacing the whole file, I need to include the full content of changed functions.

	// Re-implementing exportComponentDiagram to be safe since I'm overwriting the file structure
	query := "MATCH (n)-[r]->(m) RETURN n.name, type(r), m.name, n.path"
	if scopePath != "" {
		query = fmt.Sprintf("MATCH (n)-[r]->(m) WHERE n.path IS NOT NULL AND n.path CONTAINS '%s' RETURN n.name, type(r), m.name, n.path", scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("@startuml Architecture\n")
	sb.WriteString("title Architecture (Components)\n")
	sb.WriteString("skinparam componentStyle rectangle\n")

	seenNodes := make(map[string]bool)
	packages := make(map[string][]string)

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 3 {
					src, _ := r[0].(string)
					rel, _ := r[1].(string)
					dst, _ := r[2].(string)
					path, _ := r[3].(string)

					if src == "" || dst == "" {
						continue
					}

					if !opts.ShouldInclude(path) && path != "" {
						continue
					}

					seenNodes[src] = true
					seenNodes[dst] = true

					if strings.Contains(src, "/") {
						pkg := toPackage(src)
						if !hasNode(packages[pkg], src) {
							packages[pkg] = append(packages[pkg], src)
						}
					}

					switch rel {
					case "IMPORTS":
						sb.WriteString(fmt.Sprintf("[%s] ..> [%s]\n", src, dst))
					case "DEFINES":
						sb.WriteString(fmt.Sprintf("[%s] +-- [%s]\n", src, dst))
					default:
						sb.WriteString(fmt.Sprintf("[%s] --> [%s] : %s\n", src, dst, rel))
					}
				}
			}
		}
	}

	for pkg, nodes := range packages {
		if pkg == "" {
			continue
		}
		sb.WriteString(fmt.Sprintf("package \"%s\" {\n", pkg))
		for _, node := range nodes {
			sb.WriteString(fmt.Sprintf("  component [%s]\n", node))
		}
		sb.WriteString("}\n")
	}

	sb.WriteString("@enduml\n")
	return sb.String(), nil
}

func exportPackageDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// Improved: Aggregate file-to-file imports by directory
	query := `
		MATCH (a:Code)-[:IMPORTS]->(b:Code)
		WHERE a.path IS NOT NULL AND b.path IS NOT NULL
		RETURN a.path, b.path
	`
	if scopePath != "" {
		query = fmt.Sprintf(`
			MATCH (a:Code)-[:IMPORTS]->(b:Code)
			WHERE a.path CONTAINS '%s' AND b.path IS NOT NULL
			RETURN a.path, b.path
		`, scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	deps := make(map[string]map[string]bool)

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 2 {
					srcPath, _ := r[0].(string)
					dstPath, _ := r[1].(string)

					if !opts.ShouldInclude(srcPath) {
						continue
					}

					srcPkg := toPackage(srcPath)
					dstPkg := toPackage(dstPath)

					if srcPkg == "" || dstPkg == "" || srcPkg == dstPkg {
						continue
					}

					if deps[srcPkg] == nil {
						deps[srcPkg] = make(map[string]bool)
					}
					deps[srcPkg][dstPkg] = true
				}
			}
		}
	}

	var sb strings.Builder
	sb.WriteString("@startuml Packages\n")
	sb.WriteString("title High-level Package Dependencies\n")
	sb.WriteString("skinparam packageStyle rectangle\n")
	sb.WriteString("skinparam linetype ortho\n")

	for src, targets := range deps {
		for dst := range targets {
			sb.WriteString(fmt.Sprintf("package \"%s\" ..> package \"%s\"\n", src, dst))
		}
	}

	sb.WriteString("@enduml\n")
	return sb.String(), nil
}

func exportDependencyDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// Detailed file-level dependency graph, grouped by package
	// Relaxed query to capture all imports (Code->Code and Code->Module)
	query := `
		MATCH (a:Code)-[:IMPORTS]->(b)
		RETURN a.name, b.name, a.path, b.path
	`
	if scopePath != "" {
		query = fmt.Sprintf(`
			MATCH (a:Code)-[:IMPORTS]->(b)
			WHERE a.path CONTAINS '%s'
			RETURN a.name, b.name, a.path, b.path
		`, scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("@startuml Dependencies\n")
	sb.WriteString("title File Dependency Graph\n")
	// sb.WriteString("skinparam linetype polyline\n")
	// ranksep can help spread things out
	sb.WriteString("skinparam nodesep 20\n")
	sb.WriteString("skinparam ranksep 50\n")

	packages := make(map[string][]string)
	links := []string{}

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				// Note: b.path might be null if b is a Module
				if r, ok := row.([]any); ok && len(r) >= 2 {
					srcName, _ := r[0].(string)
					dstName, _ := r[1].(string)
					srcPath, _ := r[2].(string)
					dstPath, _ := r[3].(string) // May be empty/nil

					if !opts.ShouldInclude(srcPath) {
						continue
					}

					// Group by package
					srcPkg := toPackage(srcPath)
					if !hasNode(packages[srcPkg], srcName) {
						packages[srcPkg] = append(packages[srcPkg], srcName)
					}

					var dstPkg string
					if dstPath != "" {
						dstPkg = toPackage(dstPath)
						if strings.Contains(dstPath, "node_modules") {
							dstPkg = "External"
						}
					} else {
						// If no path, assume it's a Module/External
						dstPkg = "External"
					}

					if !hasNode(packages[dstPkg], dstName) {
						packages[dstPkg] = append(packages[dstPkg], dstName)
					}

					links = append(links, fmt.Sprintf("[%s] ..> [%s]", srcName, dstName))
				}
			}
		}
	}

	for pkg, nodes := range packages {
		sb.WriteString(fmt.Sprintf("package \"%s\" {\n", pkg))
		for _, node := range nodes {
			sb.WriteString(fmt.Sprintf("  file [%s]\n", node))
		}
		sb.WriteString("}\n")
	}

	for _, link := range links {
		sb.WriteString(link + "\n")
	}

	sb.WriteString("@enduml\n")
	return sb.String(), nil
}

func exportClassDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// Simplified class diagram - Entity Relationship style
	query := `MATCH (c:Code)-[:DEFINES]->(cls:Class) RETURN c.name, cls.name`
	if scopePath != "" {
		query = fmt.Sprintf(`MATCH (c:Code)-[:DEFINES]->(cls:Class) WHERE c.path CONTAINS '%s' RETURN c.name, cls.name`, scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("@startuml Classes\n")
	sb.WriteString("title Class Definitions\n")
	sb.WriteString("hide empty members\n") // Save space

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 2 {
					// file, _ := r[0].(string)
					cls, _ := r[1].(string)
					// Just render the entity, stripped of 'defined in' to save space
					sb.WriteString(fmt.Sprintf("entity %s\n", cls))
				}
			}
		}
	}

	// TODO: Add relationships if schema supports it later

	sb.WriteString("@enduml\n")
	return sb.String(), nil
}

func toPackage(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) > 1 {
		// Return direct parent folder
		return parts[len(parts)-2]
	}
	return "root"
}

func hasNode(slice []string, s string) bool {
	for _, item := range slice {
		if item == s {
			return true
		}
	}
	return false
}
