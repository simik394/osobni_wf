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
func GenerateReport(outputDir string, pumlMap map[string]string, mermaidStructure, mermaidClasses string, mermaidPackages map[string]string, algoMermaid string) error {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return err
	}
	indexFile := filepath.Join(outputDir, "index.html")

	// 1. Process PlantUML Map
	var pumlSections string
	pumlKeys := make([]string, 0, len(pumlMap))
	for k := range pumlMap {
		pumlKeys = append(pumlKeys, k)
	}
	sort.Strings(pumlKeys)

	for _, filename := range pumlKeys {
		content := pumlMap[filename]
		// Write the actual file to disk for manual use
		os.WriteFile(filepath.Join(outputDir, filename), []byte(content), 0644)
		isTooLarge := len(content) > 4000

		var diagramHTML string
		var urlWarning string

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

	// 2. Process Mermaid Packages Map
	var pkgSections string
	pkgKeys := make([]string, 0, len(mermaidPackages))
	for k := range mermaidPackages {
		pkgKeys = append(pkgKeys, k)
	}
	sort.Strings(pkgKeys)

	for _, name := range pkgKeys {
		content := mermaidPackages[name]
		pkgSections += fmt.Sprintf(`
		<div class="card">
			<h3>Package Dependencies: %s</h3>
			<div class="mermaid">
%s
			</div>
			<details><summary>Show Source</summary><pre>%s</pre></details>
		</div>`, name, content, truncateForHTML(content, 5000))
	}

	// 3. Prepare HTML
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
	<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
	<script>mermaid.initialize({ startOnLoad: true, securityLevel: 'loose', theme: 'default' });</script>
</head>
<body>
	<h1>Codebase Visualization Report</h1>
	<p>Generated at %s</p>

	<h2>Module Structure</h2>
	
	<div class="card">
		<h3>Internal File Structure</h3>
		<p>Defined classes and definitions.</p>
		<div class="mermaid">
%s
		</div>
		<details><summary>Show Source</summary><pre>%s</pre></details>
	</div>

	<div class="card">
		<h3>Class Definitions</h3>
		<div class="mermaid">
%s
		</div>
		<details><summary>Show Source</summary><pre>%s</pre></details>
	</div>
	
	<h2>Package Dependencies</h2>
	%s
	
	<div class="card">
		<h3>Clustering Algorithm Logic (Meta)</h3>
		<p>How the PlantUML diagrams below were generated.</p>
		<div class="mermaid">
%s
		</div>
	</div>

	<h2>Architecture Diagrams (PlantUML)</h2>
	<div class="card">
		<p>Note: Graphviz (dot) layout engine is required for best results. If 'too large', use the local source.</p>
	</div>
	
	%s

</body>
</html>`, time.Now().Format(time.RFC1123),
		mermaidStructure, truncateForHTML(mermaidStructure, 5000),
		mermaidClasses, truncateForHTML(mermaidClasses, 1000),
		pkgSections,
		algoMermaid,
		pumlSections)

	return os.WriteFile(indexFile, []byte(htmlContent), 0644)
}

// GenerateMarkdownReport generates a markdown version of the report
func GenerateMarkdownReport(outputPath string, pumlMap map[string]string, mermaidStructure, mermaidClasses string, mermaidPackages map[string]string, algoMermaid string) error {
	var sb strings.Builder
	sb.WriteString("# Codebase Visualization Report\n\n")
	sb.WriteString("Generated at: " + time.Now().Format(time.RFC1123) + "\n\n")

	sb.WriteString("## Internal Module Structure\n")
	sb.WriteString("```mermaid\n" + mermaidStructure + "\n```\n\n")

	sb.WriteString("## Class Definitions\n")
	sb.WriteString("```mermaid\n" + mermaidClasses + "\n```\n\n")

	sb.WriteString("## Package Dependencies\n\n")
	pkgKeys := make([]string, 0, len(mermaidPackages))
	for k := range mermaidPackages {
		pkgKeys = append(pkgKeys, k)
	}
	sort.Strings(pkgKeys)
	for _, name := range pkgKeys {
		sb.WriteString(fmt.Sprintf("### %s\n", name))
		sb.WriteString("```mermaid\n" + mermaidPackages[name] + "\n```\n\n")
	}

	sb.WriteString("## Clustering Algorithm Logic\n")
	sb.WriteString("```mermaid\n" + algoMermaid + "\n```\n\n")

	sb.WriteString("## PlantUML Diagrams\n\n")
	sb.WriteString("> Note: To render these manually, use `plantuml <filename>` or an IDE plugin.\n\n")

	// Sort keys for stable output
	pumlKeys := make([]string, 0, len(pumlMap))
	for k := range pumlMap {
		pumlKeys = append(pumlKeys, k)
	}
	sort.Strings(pumlKeys)

	for _, filename := range pumlKeys {
		sb.WriteString(fmt.Sprintf("### %s\n", filename))
		sb.WriteString("```plantuml\n")
		sb.WriteString(pumlMap[filename])
		sb.WriteString("\n```\n\n")
	}

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
