package export

import (
	"bytes"
	"compress/flate"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// GenerateReport creates an HTML report with embedded diagrams
func GenerateReport(outputDir string, pumlMap map[string]string, mermaidStructure, mermaidClasses, mermaidPackages, algoMermaid string) error {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return err
	}
	indexFile := filepath.Join(outputDir, "index.html")

	// 1. Process PlantUML Map
	var pumlSections string
	keys := make([]string, 0, len(pumlMap))
	for k := range pumlMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, filename := range keys {
		content := pumlMap[filename]
		// Limit for GET request is roughly 2KB, browser handles maybe 8KB.
		// Public server often fails at 4KB-8KB. Let's be conservative.
		isTooLarge := len(content) > 4000

		var diagramHTML string
		var urlWarning string

		// Generate Link (GET) - Best effort
		// Assuming deflateAndEncode is defined elsewhere or will be provided by the user.
		// For this patch, we'll use a placeholder or assume it's available.
		// If not, this line will cause a compile error.
		encoded, _ := deflateAndEncode(content)
		browserLink := "http://www.plantuml.com/plantuml/svg/" + encoded

		if isTooLarge {
			urlWarning = " <span style='color:orange; font-weight:bold;' title='Diagram too complex for public server rendering'>(Too Large)</span>"
			diagramHTML = `<div style="padding:20px; border:1px dashed #ccc; background:#fff3e0; text-align:center;">
				<strong>Diagram too large for public renderer</strong><br>
				Please copy the source below or <a href="http://www.plantuml.com/plantuml/uml" target="_blank">use the online editor</a> manually.
			</div>`
		} else {
			diagramHTML = fmt.Sprintf(`<img src="%s" alt="%s" style="max-width:100%%; height:auto;">`, browserLink, filename)
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
			%s
			<details><summary>Show PlantUML Source</summary><pre>%s</pre></details>
		</div>`, filename, browserLink, urlWarning, content, filename, diagramHTML, truncateForHTML(content, 1000000))
	}

	// 2. Prepare HTML
	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
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
		<h3>Package Dependencies</h3>
		<p>High-level directory interactions.</p>
		<div class="mermaid">
%s
		</div>
		<details><summary>Show Source</summary><pre>%s</pre></details>
	</div>
	
	<div class="card">
		<h3>Clustering Algorithm Logic (Meta)</h3>
		<p>How the PlantUML diagrams below were generated.</p>
		<div class="mermaid">
%s
		</div>
	</div>

	<h2>PlantUML Diagrams</h2>
	<div class="card">
		<p>Note: Graphviz (dot) layout engine is required for best results. If 'too large', use the local source.</p>
	</div>
	
	%s

	<script>
		// Fallback for large diagrams or errors
	</script>
</body>
</html>`, time.Now().Format(time.RFC1123),
		mermaidStructure, truncateForHTML(mermaidStructure, 5000),
		mermaidClasses, truncateForHTML(mermaidClasses, 1000),
		mermaidPackages, truncateForHTML(mermaidPackages, 1000),
		algoMermaid,
		pumlSections)

	return os.WriteFile(indexFile, []byte(htmlContent), 0644)
}

// GenerateMarkdownReport generates a markdown version of the report
func GenerateMarkdownReport(outputPath string, pumlMap map[string]string, mermaidStructure, mermaidClasses, mermaidPackages, algoMermaid string) error {
	var sb strings.Builder
	sb.WriteString("# Codebase Visualization Report\n\n")
	sb.WriteString("Generated at: " + time.Now().Format(time.RFC1123) + "\n\n")

	sb.WriteString("## Internal Module Structure\n")
	sb.WriteString("```mermaid\n" + mermaidStructure + "\n```\n\n")

	sb.WriteString("## Class Definitions\n")
	sb.WriteString("```mermaid\n" + mermaidClasses + "\n```\n\n")

	sb.WriteString("## Package Dependencies\n")
	sb.WriteString("```mermaid\n" + mermaidPackages + "\n```\n\n")

	sb.WriteString("## Clustering Algorithm Logic\n")
	sb.WriteString("```mermaid\n" + algoMermaid + "\n```\n\n")

	sb.WriteString("## PlantUML Diagrams\n\n")
	sb.WriteString("> Note: To render these manually, use `plantuml <filename>` or an IDE plugin.\n\n")

	// Sort keys for stable output
	keys := make([]string, 0, len(pumlMap))
	for k := range pumlMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, filename := range keys {
		sb.WriteString(fmt.Sprintf("### %s\n", filename))
		sb.WriteString("```plantuml\n")
		sb.WriteString(pumlMap[filename])
		sb.WriteString("\n```\n\n")
	}

	sb.WriteString("## Graphviz Instructions\n\n")
	sb.WriteString("To render the `.dot` graph manually:\n")
	sb.WriteString("```bash\n")
	sb.WriteString("dot -Tsvg graph.dot -o graph.svg\n")
	sb.WriteString("```\n")

	return os.WriteFile(outputPath, []byte(sb.String()), 0644)
}

// truncateForHTML limits content length for HTML embedding
func truncateForHTML(content string, maxLen int) string {
	if len(content) <= maxLen {
		return content
	}
	return content[:maxLen] + "\n... (truncated, see original files for full content)"
}

// deflateAndEncode compresses string using ZLIB and custom base64 for PlantUML
func deflateAndEncode(input string) (string, error) {
	// 1. Deflate (compress)
	var b bytes.Buffer
	w, err := flate.NewWriter(&b, flate.BestCompression)
	if err != nil {
		return "", err
	}
	w.Write([]byte(input))
	w.Close()

	// 2. Custom Base64 Encoding
	return encode64(b.Bytes()), nil
}

// Helper to escape HTML (not used currently but kept for utility)
func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
