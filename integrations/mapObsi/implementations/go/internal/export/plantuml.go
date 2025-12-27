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

	return results, nil
}

func exportComponentDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
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
						sb.WriteString(fmt.Sprintf("[%s] ..> [%s] : imports\n", src, dst))
					case "DEFINES":
						sb.WriteString(fmt.Sprintf("[%s] +-- [%s] : defines\n", src, dst))
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
	// Focus on imports between modules (packages)
	query := `
		MATCH (c1:Code)-[:IMPORTS]->(m:Module)
		WHERE c1.path IS NOT NULL
		RETURN c1.path, m.name
	`
	if scopePath != "" {
		query = fmt.Sprintf(`
			MATCH (c1:Code)-[:IMPORTS]->(m:Module)
			WHERE c1.path CONTAINS '%s'
			RETURN c1.path, m.name
		`, scopePath)
	}

	res, err := client.Query(ctx, query)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("@startuml Packages\n")
	sb.WriteString("title High-level Package Dependencies\n")
	sb.WriteString("skinparam packageStyle frame\n")

	deps := make(map[string]map[string]bool)

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 2 {
					srcPath, _ := r[0].(string)
					dstPkg, _ := r[1].(string)

					if !opts.ShouldInclude(srcPath) {
						continue
					}

					srcPkg := toPackage(srcPath)
					if srcPkg == "" || dstPkg == "" || srcPkg == dstPkg {
						continue
					}

					// Simplify dstPkg if it's external
					if strings.Contains(dstPkg, "/") {
						dstPkg = strings.Split(dstPkg, "/")[0]
					}

					if deps[srcPkg] == nil {
						deps[srcPkg] = make(map[string]bool)
					}
					deps[srcPkg][dstPkg] = true
				}
			}
		}
	}

	for src, targets := range deps {
		for dst := range targets {
			sb.WriteString(fmt.Sprintf("package \"%s\" ..> package \"%s\"\n", src, dst))
		}
	}

	sb.WriteString("@enduml\n")
	return sb.String(), nil
}

func exportClassDiagram(ctx context.Context, client *db.Client, scopePath string, opts ExportOptions) (string, error) {
	// Classes and their definitions
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

	if arr, ok := res.([]any); ok && len(arr) > 1 {
		if rows, ok := arr[1].([]any); ok {
			for _, row := range rows {
				if r, ok := row.([]any); ok && len(r) >= 2 {
					file, _ := r[0].(string)
					cls, _ := r[1].(string)
					sb.WriteString(fmt.Sprintf("class %s {\n  .. defined in ..\n  %s\n}\n", cls, file))
				}
			}
		}
	}

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
