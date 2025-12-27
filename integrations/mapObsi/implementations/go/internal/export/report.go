package export

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// GenerateReport creates an index.html dashboard with rendered images
func GenerateReport(outputDir, mermaidInternal, mermaidExternal, dotContent string, pumlContent map[string]string) error {
	// Ensure dir exists
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return err
	}

	// Write raw files
	os.WriteFile(filepath.Join(outputDir, "structure.mermaid"), []byte(mermaidInternal), 0644)
	os.WriteFile(filepath.Join(outputDir, "dependencies.mermaid"), []byte(mermaidExternal), 0644)
	os.WriteFile(filepath.Join(outputDir, "graph.dot"), []byte(dotContent), 0644)

	// Process PlantUML files
	var pumlSections string
	for filename, content := range pumlContent {
		os.WriteFile(filepath.Join(outputDir, filename), []byte(content), 0644)

		encoded, _ := encodePlantUML(content)
		browserLink := fmt.Sprintf("http://www.plantuml.com/plantuml/svg/%s", encoded)

		// Warning if content is too large for URL (approx 2KB safe limit, but browsers support more, 8KB is risky)
		urlWarning := ""
		if len(encoded) > 8000 {
			urlWarning = " (Note: Diagram may be too large for direct link, use Copy Source + Editor)"
		}

		pumlSections += fmt.Sprintf(`
		<div class="diagram">
			<h3>%s</h3>
			<p>
				<a href="%s" target="_blank">View in Browser (SVG)</a>%s | 
				<button onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent).then(()=>alert('Copied!'))" style="background:none; border:none; color:#0066cc; cursor:pointer; text-decoration:underline;">Copy Source</button>
				<span style="display:none;">%s</span> |
				<a href="%s" target="_blank">Raw Source</a>
				<br/>
				<small>If link fails, copy source and paste in <a href="http://www.plantuml.com/plantuml" target="_blank">PlantUML Editor</a></small>
			</p>
			<details><summary>Show Source</summary><pre>%s</pre></details>
		</div>`, filename, browserLink, urlWarning, content, filename, truncateForHTML(content, 1000000))
	}

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
        h1, h2, h3 { color: #333; }
        summary { cursor: pointer; color: #0066cc; margin-top: 10px; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
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

        <h2>🏗️ Architecture Diagrams (PlantUML)</h2>
        %s
    </div>
</body>
</html>`, internalSection, externalSection, dotSection, pumlSections)

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
