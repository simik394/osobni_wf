package export

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// GenerateReport creates an index.html dashboard with rendered images
func GenerateReport(outputDir, mermaidInternal, mermaidExternal, dotContent, pumlContent string) error {
	// Ensure dir exists
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return err
	}

	// Write raw files
	os.WriteFile(filepath.Join(outputDir, "structure.mermaid"), []byte(mermaidInternal), 0644)
	os.WriteFile(filepath.Join(outputDir, "dependencies.mermaid"), []byte(mermaidExternal), 0644)
	os.WriteFile(filepath.Join(outputDir, "graph.dot"), []byte(dotContent), 0644)
	os.WriteFile(filepath.Join(outputDir, "classes.puml"), []byte(pumlContent), 0644)

	// Try to render internal structure
	internalSVG := ""
	internalPath := filepath.Join(outputDir, "structure.mermaid")
	internalSVGPath := filepath.Join(outputDir, "structure.svg")
	if mmdc, err := exec.LookPath("mmdc"); err == nil {
		cmd := exec.Command(mmdc, "-i", internalPath, "-o", internalSVGPath, "-b", "transparent")
		if err := cmd.Run(); err == nil {
			if b, err := os.ReadFile(internalSVGPath); err == nil {
				internalSVG = string(b)
			}
		}
	}

	// Try to render dependencies
	externalSVG := ""
	externalPath := filepath.Join(outputDir, "dependencies.mermaid")
	externalSVGPath := filepath.Join(outputDir, "dependencies.svg")
	if mmdc, err := exec.LookPath("mmdc"); err == nil {
		cmd := exec.Command(mmdc, "-i", externalPath, "-o", externalSVGPath, "-b", "transparent")
		if err := cmd.Run(); err == nil {
			if b, err := os.ReadFile(externalSVGPath); err == nil {
				externalSVG = string(b)
			}
		}
	}

	// Try to render DOT
	dotSVG := ""
	dotPath := filepath.Join(outputDir, "graph.dot")
	dotSVGPath := filepath.Join(outputDir, "graph.svg")
	if dot, err := exec.LookPath("dot"); err == nil {
		cmd := exec.Command(dot, "-Tsvg", "-o", dotSVGPath, dotPath)
		if err := cmd.Run(); err == nil {
			if b, err := os.ReadFile(dotSVGPath); err == nil {
				dotSVG = string(b)
			}
		}
	}

	// Build Sections
	var internalSection string
	if internalSVG != "" {
		internalSection = fmt.Sprintf(`<div class="diagram">%s</div>`, internalSVG)
	} else {
		internalSection = fmt.Sprintf(`<div class="diagram mermaid">%s</div>`, mermaidInternal)
	}

	var externalSection string
	if externalSVG != "" {
		externalSection = fmt.Sprintf(`<div class="diagram">%s</div>`, externalSVG)
	} else {
		externalSection = fmt.Sprintf(`<div class="diagram mermaid">%s</div>`, mermaidExternal)
	}

	var dotSection string
	if dotSVG != "" {
		dotSection = fmt.Sprintf(`<div class="diagram">%s</div>`, dotSVG)
	} else {
		dotSection = fmt.Sprintf(`<p>Graphviz not found. <a href="graph.dot" target="_blank">Raw DOT</a></p>`)
	}

	pumlSection := fmt.Sprintf(`
		<p>PlantUML version (best for large scale). <a href="classes.puml" target="_blank">Raw PUML</a></p>
		<details><summary>Show PUML source</summary><pre>%s</pre></details>`, truncateForHTML(pumlContent, 1000000)) // Limit to 1MB

	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Codebase Map Report</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; margin: 20px; background: #fafafa; }
        .container { max-width: 1400px; margin: 0 auto; }
        .diagram { border: 1px solid #ddd; padding: 10px; border-radius: 8px; background: white; margin-bottom: 20px; overflow: auto; }
        .diagram svg { max-width: 100%%; height: auto; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; font-size: 11px; overflow: auto; }
        h1, h2 { color: #333; }
        summary { cursor: pointer; color: #0066cc; margin-top: 10px; }
    </style>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: true, securityLevel: 'loose' });
    </script>
</head>
<body>
    <div class="container">
        <h1>📊 Codebase Map Report</h1>
        
        <h2>📁 Module Structure</h2>
        %s

        <h2>📦 Dependency Graph</h2>
        %s

        <h2>🌳 Full Relationship Graph (DOT)</h2>
        %s

        <h2>🏗️ Architecture (PlantUML)</h2>
        %s
    </div>
</body>
</html>`, internalSection, externalSection, dotSection, pumlSection)

	reportPath := filepath.Join(outputDir, "index.html")
	return os.WriteFile(reportPath, []byte(htmlContent), 0644)
}

// truncateForHTML limits content length for HTML embedding
func truncateForHTML(content string, maxLen int) string {
	if len(content) <= maxLen {
		return content
	}
	return content[:maxLen] + "\n... (truncated, see original files for full content)"
}

// Helper to escape HTML (not used currently but kept for utility)
func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
