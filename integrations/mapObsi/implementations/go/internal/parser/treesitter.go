package parser

import (
	"context"
	"fmt"
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/golang"
	"github.com/smacker/go-tree-sitter/javascript"
	"github.com/smacker/go-tree-sitter/python"
	"github.com/smacker/go-tree-sitter/typescript/typescript"
	// "github.com/smacker/go-tree-sitter/rust" // Rust binding might need manual check or similar package
)

// TreeSitterParser handles parsing code using tree-sitter
type TreeSitterParser struct {
	parsers map[string]*sitter.Language
}

// NewTreeSitterParser initializes parsers for supported languages
func NewTreeSitterParser() *TreeSitterParser {
	return &TreeSitterParser{
		parsers: map[string]*sitter.Language{
			"go":         golang.GetLanguage(),
			"python":     python.GetLanguage(),
			"javascript": javascript.GetLanguage(),
			"typescript": typescript.GetLanguage(),
			// "rust":       rust.GetLanguage(), // Uncomment when rust binding is confirmed
		},
	}
}

// Parse parses the content and extracts metadata
func (tsp *TreeSitterParser) Parse(content []byte, lang string) (*CodeMetadata, error) {
	language, ok := tsp.parsers[lang]
	if !ok {
		return nil, fmt.Errorf("unsupported language: %s", lang)
	}

	parser := sitter.NewParser()
	parser.SetLanguage(language)

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		return nil, err
	}
	defer tree.Close()

	root := tree.RootNode()

	meta := &CodeMetadata{
		Language: lang,
	}

	// Define queries for different languages
	// Note: these are simplified queries. Real-world queries should be more robust.
	var queryStr string
	switch lang {
	case "go":
		queryStr = `
			(function_declaration name: (identifier) @func.name) @func
			(method_declaration name: (field_identifier) @method.name) @method
			(type_declaration (type_spec name: (type_identifier) @type.name)) @type
			(import_spec path: (interpreted_string_literal) @import)
		`
	case "python":
		queryStr = `
			(function_definition name: (identifier) @func.name) @func
			(class_definition name: (identifier) @class.name) @class
			(import_statement name: (dotted_name) @import)
			(import_from_statement module_name: (dotted_name) @import)
		`
	case "typescript", "javascript":
		// TypeScript uses type_identifier for class names, JavaScript uses identifier
		// Simplified query to avoid syntax errors
		queryStr = `
			(function_declaration name: (identifier) @func.name)
			(class_declaration name: (type_identifier) @class.name)
			(method_definition name: (property_identifier) @method.name)
			(import_statement source: (string) @import)
		`
	}

	if queryStr != "" {
		q, err := sitter.NewQuery([]byte(queryStr), language)
		if err != nil {
			return nil, fmt.Errorf("invalid query: %w", err)
		}
		defer q.Close()

		qc := sitter.NewQueryCursor()
		defer qc.Close()

		qc.Exec(q, root)

		for {
			m, ok := qc.NextMatch()
			if !ok {
				break
			}

			for _, c := range m.Captures {
				name := q.CaptureNameForId(c.Index)
				details := extractNodeDetails(c.Node, content)

				switch name {
				case "func.name", "method.name":
					// Find parent for signature? Or just use this node?
					// For now, let's treat the captured identifier as the name
					// and looking up the parent for the signature might be complex here without efficient mapping.
					// We'll trust the capture is the name.

					// We need to find the full function node to get the signature/line
					// Logic: @func.name is inside @func.
					// But our query iterates captures.
					// Let's simplify: only capture the full node and extract name manually?
					// Or stick to simple "Name" extraction.

					meta.Functions = append(meta.Functions, Function{
						Name: details.Text,
						Line: int(c.Node.StartPoint().Row) + 1,
						// Signature: ... (would require getting parent node text)
					})

				case "class.name", "type.name":
					meta.Classes = append(meta.Classes, Class{
						Name: details.Text,
						Line: int(c.Node.StartPoint().Row) + 1,
					})

				case "import":
					meta.Imports = append(meta.Imports, strings.Trim(details.Text, `"'`))
				}
			}
		}
	}

	return meta, nil
}

type nodeDetails struct {
	Text string
}

func extractNodeDetails(n *sitter.Node, content []byte) nodeDetails {
	return nodeDetails{
		Text: n.Content(content),
	}
}
