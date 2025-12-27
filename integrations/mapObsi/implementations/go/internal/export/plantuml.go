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

	// 1. Architecture / Component Diagram (Split by package)
	if comps, err := exportComponentDiagram(ctx, client, scopePath, opts); err == nil {
		for name, content := range comps {
			results[name] = content
		}
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

func exportComponentDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (map[string]string, error) {
	results := make(map[string]string)

	// Query all relationships
	query := "MATCH (n)-[r]->(m) RETURN n.name, type(r), m.name, n.path, m.path"
	if scopePath != "" {
		query = fmt.Sprintf("MATCH (n)-[r]->(m) WHERE n.path IS NOT NULL AND n.path CONTAINS '%s' RETURN n.name, type(r), m.name, n.path, m.path", scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return nil, err
	}

	// In-memory graph structure
	type Edge struct {
		Src, Dst, Rel string
	}
	edges := []Edge{}
	// Map: Package -> []NodeName
	pkgNodes := make(map[string]map[string]bool)
	// Map: NodeName -> NodePath
	nodePaths := make(map[string]string)

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 5 {
					src, _ := r[0].(string)
					rel, _ := r[1].(string)
					dst, _ := r[2].(string)
					srcPath, _ := r[3].(string)
					dstPath, _ := r[4].(string)

					if src == "" || dst == "" {
						continue
					}
					if !opts.ShouldInclude(srcPath) && srcPath != "" {
						continue
					}

					edges = append(edges, Edge{src, dst, rel})

					// Assign src to its package
					if srcPath != "" {
						pkg := toPackage(srcPath)
						if pkgNodes[pkg] == nil {
							pkgNodes[pkg] = make(map[string]bool)
						}
						pkgNodes[pkg][src] = true
						nodePaths[src] = srcPath
					}

					// Track dst path if available
					if dstPath != "" {
						nodePaths[dst] = dstPath
					} else {
						// External/Module
						nodePaths[dst] = "external"
					}
				}
			}
		}
	}

	// For each package, generate a diagram
	for funcPkg, nodes := range pkgNodes {
		if len(nodes) == 0 {
			continue
		}

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("@startuml Architecture_%s\n", funcPkg))
		sb.WriteString(fmt.Sprintf("title Architecture: %s\n", funcPkg))
		sb.WriteString("skinparam componentStyle rectangle\n")

		// Track which nodes are already defined in this diagram to avoid dupes
		definedNodes := make(map[string]bool)

		// 1. Definition Phase: Core Nodes
		sb.WriteString(fmt.Sprintf("package \"%s\" {\n", funcPkg))
		for node := range nodes {
			sb.WriteString(fmt.Sprintf("  component [%s]\n", node))
			definedNodes[node] = true
		}
		sb.WriteString("}\n")

		// 2. Identify Frontier Nodes (External nodes connected to/from this package)
		frontierNodes := make(map[string]string) // Name -> Package
		relevantEdges := []Edge{}

		for _, e := range edges {
			isSrcIn := nodes[e.Src]
			isDstIn := nodes[e.Dst]

			if isSrcIn && isDstIn {
				// Internal edge
				relevantEdges = append(relevantEdges, e)
			} else if isSrcIn && !isDstIn {
				// Outgoing to frontier
				frontierNodes[e.Dst] = getPackageForNode(e.Dst, nodePaths)
				relevantEdges = append(relevantEdges, e)
			} else if !isSrcIn && isDstIn {
				// Incoming from frontier
				frontierNodes[e.Src] = getPackageForNode(e.Src, nodePaths)
				relevantEdges = append(relevantEdges, e)
			}
		}

		// 3. Definition Phase: Frontier Nodes (Grouped by their package)
		// Group frontier nodes by their package for better visuals
		frontierByPkg := make(map[string][]string)
		for node, p := range frontierNodes {
			frontierByPkg[p] = append(frontierByPkg[p], node)
		}

		for p, fNodes := range frontierByPkg {
			sb.WriteString(fmt.Sprintf("package \"%s\" as ext_%s {\n", p, strings.ReplaceAll(p, "/", "_")))
			for _, node := range fNodes {
				if !definedNodes[node] {
					sb.WriteString(fmt.Sprintf("  component [%s]\n", node))
					definedNodes[node] = true
				}
			}
			sb.WriteString("}\n")
		}

		// 4. Edges Phase
		for _, e := range relevantEdges {
			switch e.Rel {
			case "IMPORTS":
				sb.WriteString(fmt.Sprintf("[%s] ..> [%s]\n", e.Src, e.Dst))
			case "DEFINES":
				sb.WriteString(fmt.Sprintf("[%s] +-- [%s]\n", e.Src, e.Dst))
			default:
				sb.WriteString(fmt.Sprintf("[%s] --> [%s] : %s\n", e.Src, e.Dst, e.Rel))
			}
		}

		sb.WriteString("@enduml\n")

		safeName := strings.ReplaceAll(funcPkg, "/", "_")
		safeName = strings.ReplaceAll(safeName, " ", "_")
		results[fmt.Sprintf("architecture_%s.puml", safeName)] = sb.String()
	}

	return results, nil
}

// Wrapper for getPackage using correct signature helper
func getPackageForNode(node string, paths map[string]string) string {
	if p, ok := paths[node]; ok && p != "" && p != "external" {
		return toPackage(p)
	}
	return "External"
}

func exportPackageDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// Improved: Aggregate file-to-file imports by directory
	// Relaxed query to match (Code)-[:IMPORTS]->(b) where b can be Code or Module
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

	deps := make(map[string]map[string]bool)

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

					var dstPkg string
					if dstPath != "" {
						dstPkg = toPackage(dstPath)
					} else {
						// Fallback: use name or "External" + name
						if dstName != "" {
							dstPkg = "External" // Simplification: Group all external? Or by name?
							// If name is like "module/pkg", use that
							parts := strings.Split(dstName, "/")
							if len(parts) > 0 {
								dstPkg = parts[0]
							}
						} else {
							continue
						}
					}

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
