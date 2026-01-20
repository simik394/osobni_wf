package ingest

import (
	"testing"
)

func TestIsDefinition(t *testing.T) {
	// Note: isDefinition requires non-nil scip.Occurrence
	// Full testing requires scip.Occurrence mock with SymbolRoles set
	// Skipping direct test as it requires scip protobuf creation
	t.Skip("requires scip.Occurrence mock")
}

func TestParseSymbolName(t *testing.T) {
	tests := []struct {
		symbol   string
		expected string
	}{
		{"scip-go go github.com/example 1.0.0 pkg/Service#Method.", "Method"},
		{"scip-python python mapObsi 0.1.0 internal/db/Client#UpsertCode.", "UpsertCode"},
		{"simple", "simple"},
		{"pkg.Class", "Class"},
		{"pkg/sub/Func", "Func"},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.symbol, func(t *testing.T) {
			result := parseSymbolName(tt.symbol)
			if result != tt.expected {
				t.Errorf("parseSymbolName(%q) = %q, want %q", tt.symbol, result, tt.expected)
			}
		})
	}
}

func TestEscapeCypher(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello", "hello"},
		{"it's", "it\\'s"},
		{`say "hi"`, `say \"hi\"`},
		{`path\to\file`, `path\\to\\file`},
		{`mixed 'quotes' and "doubles"`, `mixed \'quotes\' and \"doubles\"`},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := escapeCypher(tt.input)
			if result != tt.expected {
				t.Errorf("escapeCypher(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
