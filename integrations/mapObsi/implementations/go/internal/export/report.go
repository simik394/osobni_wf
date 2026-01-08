package export

import (
	"bytes"
	"compress/flate"
	_ "embed"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

//go:embed report.html
var reportTemplate string

// Structs for template data
type ReportData struct {
	GeneratedAt               string
	MermaidStructure          string
	MermaidStructureTruncated string
	MermaidClasses            string
	MermaidClassesTruncated   string
	MermaidPackages           []PackageSection
	AlgoMermaid               string
	PlantUMLDiagrams          []PlantUMLDiagram
}

type PackageSection struct {
	Name             string
	Content          string
	ContentTruncated string
}

type PlantUMLDiagram struct {
	Filename         string
	BrowserLink      string
	URLWarning       template.HTML
	IsTooLarge       bool
	Content          string
	ContentTruncated string
}

// GenerateReport creates an HTML report with embedded diagrams
func GenerateReport(outputDir string, pumlMap map[string]string, mermaidStructure, mermaidClasses string, mermaidPackages map[string]string, algoMermaid string) error {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return err
	}
	indexFile := filepath.Join(outputDir, "index.html")

	// Parse template
	tmpl, err := template.New("report").Parse(reportTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse report template: %w", err)
	}

	// Prepare data
	data := ReportData{
		GeneratedAt:               time.Now().Format(time.RFC1123),
		MermaidStructure:          mermaidStructure,
		MermaidStructureTruncated: truncateForHTML(mermaidStructure, 5000),
		MermaidClasses:            mermaidClasses,
		MermaidClassesTruncated:   truncateForHTML(mermaidClasses, 1000),
		AlgoMermaid:               algoMermaid,
	}

	// Process Mermaid Packages
	pkgKeys := make([]string, 0, len(mermaidPackages))
	for k := range mermaidPackages {
		pkgKeys = append(pkgKeys, k)
	}
	sort.Strings(pkgKeys)

	for _, name := range pkgKeys {
		content := mermaidPackages[name]
		data.MermaidPackages = append(data.MermaidPackages, PackageSection{
			Name:             name,
			Content:          content,
			ContentTruncated: truncateForHTML(content, 5000),
		})
	}

	// Process PlantUML
	pumlKeys := make([]string, 0, len(pumlMap))
	for k := range pumlMap {
		pumlKeys = append(pumlKeys, k)
	}
	sort.Strings(pumlKeys)

	for _, filename := range pumlKeys {
		content := pumlMap[filename]
		// Write the actual file to disk for manual use
		if err := os.WriteFile(filepath.Join(outputDir, filename), []byte(content), 0644); err != nil {
			return err
		}
		isTooLarge := len(content) > 4000
		encoded, _ := deflateAndEncode(content)
		browserLink := "http://www.plantuml.com/plantuml/svg/" + encoded

		var urlWarning template.HTML
		if isTooLarge {
			urlWarning = template.HTML(" <span style='color:orange; font-weight:bold;' title='Diagram too complex for public server rendering'>(Too Large)</span>")
		}

		data.PlantUMLDiagrams = append(data.PlantUMLDiagrams, PlantUMLDiagram{
			Filename:         filename,
			BrowserLink:      browserLink,
			URLWarning:       urlWarning,
			IsTooLarge:       isTooLarge,
			Content:          content,
			ContentTruncated: truncateForHTML(content, 1000000),
		})
	}

	// Execute template
	f, err := os.Create(indexFile)
	if err != nil {
		return err
	}
	defer f.Close()

	return tmpl.Execute(f, data)
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
