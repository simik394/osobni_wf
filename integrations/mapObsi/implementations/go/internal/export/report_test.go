package export

import (
	"testing"
)

func TestTruncateForHTML(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		maxLen    int
		wantLen   int
		truncated bool
	}{
		{"short content", "hello", 10, 5, false},
		{"exact length", "hello", 5, 5, false},
		{"needs truncation", "hello world this is a long string", 10, 10, true},
		{"empty string", "", 10, 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := truncateForHTML(tt.content, tt.maxLen)
			if tt.truncated {
				if len(result) <= len(tt.content) && !containsSubstr(result, "truncated") {
					t.Errorf("expected truncated content with marker, got %q", result)
				}
			} else {
				if result != tt.content {
					t.Errorf("expected %q, got %q", tt.content, result)
				}
			}
		})
	}
}

func TestEscapeHTML(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello", "hello"},
		{"<script>", "&lt;script&gt;"},
		{"a & b", "a &amp; b"},
		{"<>&", "&lt;&gt;&amp;"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := escapeHTML(tt.input)
			if result != tt.expected {
				t.Errorf("escapeHTML(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestDeflateAndEncode(t *testing.T) {
	// Test that deflateAndEncode returns a non-empty string for valid input
	input := "@startuml\nclass Test\n@enduml"
	encoded, err := deflateAndEncode(input)
	if err != nil {
		t.Fatalf("deflateAndEncode failed: %v", err)
	}
	if encoded == "" {
		t.Error("expected non-empty encoded string")
	}
	// Encoded should be different from input (compressed + base64)
	if encoded == input {
		t.Error("encoded should differ from input")
	}
}

func TestReportDataStruct(t *testing.T) {
	data := ReportData{
		GeneratedAt:      "test-time",
		MermaidStructure: "graph TD; A-->B",
	}
	if data.GeneratedAt != "test-time" {
		t.Errorf("unexpected GeneratedAt: %s", data.GeneratedAt)
	}
}

func TestPackageSectionStruct(t *testing.T) {
	section := PackageSection{
		Name:    "test-package",
		Content: "graph TD; A-->B",
	}
	if section.Name != "test-package" {
		t.Errorf("unexpected Name: %s", section.Name)
	}
}

func TestPlantUMLDiagramStruct(t *testing.T) {
	diagram := PlantUMLDiagram{
		Filename:    "test.puml",
		BrowserLink: "http://example.com",
		IsTooLarge:  true,
	}
	if !diagram.IsTooLarge {
		t.Error("expected IsTooLarge to be true")
	}
}

func containsSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if i+len(substr) <= len(s) && s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
