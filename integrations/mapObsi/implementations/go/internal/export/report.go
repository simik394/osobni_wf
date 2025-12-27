package export

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	// Added for time.Now()
)

// GenerateReport creates an HTML report with embedded diagrams
func GenerateReport(outputDir, mermaidInternal, mermaidExternal, mermaidClasses, dotContent string, pumlContent map[string]string) error {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return err
	}

	// Helper to write files
	writeFile := func(name, content string) {
		os.WriteFile(filepath.Join(outputDir, name), []byte(content), 0644)
	}

	writeFile("structure.mermaid", mermaidInternal)
	writeFile("dependencies.mermaid", mermaidExternal)
	writeFile("classes.mermaid", mermaidClasses)
	writeFile("graph.dot", dotContent)

	// SVG generation from DOT (optional, requires graphviz installed)
	// We check for 'dot' availability before trying
	if dot, err := exec.LookPath("dot"); err == nil {
		dotPath := filepath.Join(outputDir, "graph.dot")
		dotSVGPath := filepath.Join(outputDir, "graph.svg")
		exec.Command(dot, "-Tsvg", dotPath, "-o", dotSVGPath).Run()
	}

	// Process PlantUML files
	var pumlSections string
	for filename, content := range pumlContent {
		writeFile(filename, content)

		encoded, _ := encodePlantUML(content)
		browserLink := fmt.Sprintf("http://www.plantuml.com/plantuml/svg/%s", encoded)

		// Warning if content is too large
		urlWarning := ""
		if len(encoded) > 8000 {
			urlWarning = " (Large diagram: Use Copy Source)"
		}

		pumlSections += fmt.Sprintf(`
		<div class="card">
			<h3>%s</h3>
			<div class="controls">
				<a href="%s" target="_blank">View in PlantUML Server</a>%s | 
				<button onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent).then(()=>alert('Copied!'))">Copy Source</button>
				<span style="display:none;">%s</span> |
				<a href="%s" target="_blank">Raw Source</a>
			</div>
			<details><summary>Show PlantUML Source</summary><pre>%s</pre></details>
		</div>`, filename, browserLink, urlWarning, content, filename, truncateForHTML(content, 1000000))
	}

	// Mermaid JS is assumed to be present in the output directory (e.g. via wget or copy)
	// <script src="mermaid.min.js"></script> in HTML handles loading.

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
	<title>Codebase Visualization Report</title>
	<meta charset="utf-8">
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
		h1, h2, h3 { color: #2c3e50; }
		.card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; padding: 20px; }
		pre { background: #f4f4f4; padding: 10px; overflow-x: auto; border-radius: 4px; max-height: 300px; }
		.mermaid { background: white; padding: 10px; border-radius: 4px; overflow-x: auto; }
		details { margin-top: 10px; }
		a { color: #0366d6; text-decoration: none; }
		a:hover { text-decoration: underline; }
		.controls { margin-bottom: 10px; font-size: 0.9em; }
		button { cursor: pointer; color: #0366d6; background: none; border: none; text-decoration: underline; padding: 0; font: inherit; }
	</style>
	<script src="mermaid.min.js"></script>
	<script>mermaid.initialize({ startOnLoad: true, securityLevel: 'loose', theme: 'default' });</script>
</head>
<body>
	<h1>Codebase Visualization Report</h1>
	<p>Generated at %s</p>

	<h2>Mermaid Diagrams (Client-Side Rendered)</h2>
	
	<div class="card">
		<h3>Internal Module Structure</h3>
		<p>Grouped by directory structure.</p>
		<div class="mermaid">
%s
		</div>
		<details><summary>Show Source</summary><pre>%s</pre></details>
	</div>

	<div class="card">
		<h3>Class Definitions</h3>
		<p>Classes defined in the codebase.</p>
		<div class="mermaid">
%s
		</div>
		<details><summary>Show Source</summary><pre>%s</pre></details>
	</div>

	<div class="card">
		<h3>External Dependencies</h3>
		<div class="mermaid">
%s
		</div>
		<details><summary>Show Source</summary><pre>%s</pre></details>
	</div>

	<h2>PlantUML Diagrams (Server-Side / External)</h2>
	<p>Alternative visualizations. If images fail to load due to size, use "Copy Source" and paste into a local tool or PlantUML editor.</p>
	%s

	<h2>Graphviz (DOT)</h2>
	<div class="card">
		<h3>Raw Graph Data</h3>
		<p><a href="graph.dot" target="_blank">Download .dot file</a> (Render with 'dot -Tsvg graph.dot -o graph.svg')</p>
	</div>

</body>
</html>`, time.Now().Format(time.RFC1123),
		mermaidInternal, truncateForHTML(mermaidInternal, 500000),
		mermaidClasses, truncateForHTML(mermaidClasses, 500000),
		mermaidExternal, truncateForHTML(mermaidExternal, 500000),
		pumlSections)

	return os.WriteFile(filepath.Join(outputDir, "index.html"), []byte(html), 0644)
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
