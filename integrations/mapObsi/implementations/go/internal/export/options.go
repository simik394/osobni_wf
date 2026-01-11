package export

import "strings"

// ExportOptions configures filtering and detail level
type ExportOptions struct {
	// Excludes contains path substrings to filter out (e.g., "node_modules")
	Excludes []string
	// Detail level: "high" (all), "medium" (user code), "low" (summary)
	Detail string
	// Filter: "all", "internal" (structural), "external" (dependencies)
	Filter string
	// NodeTypes to include: "Class", "Function", "Package", "File"
	NodeTypes []string
	// RelTypes to include: "IMPORTS", "DEFINES", "CALLS"
	RelTypes []string
	// Depth limit for traversal (0 = unlimited)
	Depth int
}

// SanitizeCypher ensures input strings are safe for Cypher injection (alphanumeric + underscore)
func SanitizeCypher(s string) string {
	return strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			return r
		}
		return -1
	}, s)
}

const (
	FilterAll      = "all"
	FilterInternal = "internal"
	FilterExternal = "external"
)

// DefaultExportOptions returns sensible defaults
func DefaultExportOptions() ExportOptions {
	return ExportOptions{
		Excludes:  []string{"node_modules", "vendor", ".git"},
		Detail:    "medium",
		Filter:    FilterAll,
		NodeTypes: []string{}, // Empty means all relevant types
		RelTypes:  []string{}, // Empty means all relevant relationships
		Depth:     0,          // 0 means unlimited
	}
}

// ShouldInclude checks if a path should be included based on excludes
func (o ExportOptions) ShouldInclude(path string) bool {
	for _, ex := range o.Excludes {
		if len(ex) > 0 && contains(path, ex) {
			return false
		}
	}
	return true
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > len(substr) && searchSubstring(s, substr)))
}

func searchSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
