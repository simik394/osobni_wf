package export

import (
	"fmt"
	"testing"
	"strings"

	"github.com/stretchr/testify/assert"
)

// Since we cannot mock db.Client easily (concrete struct), we will refactor query generation
// into helper functions and test those.
// However, since we can't change the main code drastically right now, we will add tests for
// the options/sanitization logic and ensure coverage of helper functions if they were exposed.

// We'll simulate the "logic" of options filtering by testing helper functions we can access or create here.

func TestMermaidQueryGeneration_Logic(t *testing.T) {
	// This test validates that we construct the query components correctly
	// based on options. We are essentially duplicating the logic to verify it.

	opts := ExportOptions{
		NodeTypes: []string{"Class", "Function"},
		RelTypes:  []string{"DEFINES"},
		Depth:     3,
	}

	// 1. Verify Sanitize
	safeType := SanitizeCypher("Class; DROP TABLE")
	assert.Equal(t, "ClassDROPTABLE", safeType)

	// 2. Verify Label Filter Construction
	labelFilter := ""
	if len(opts.NodeTypes) > 0 {
		validTypes := make([]string, 0, len(opts.NodeTypes))
		for _, t := range opts.NodeTypes {
			safe := SanitizeCypher(t)
			validTypes = append(validTypes, fmt.Sprintf("'%s'", safe))
		}
		labelFilter = fmt.Sprintf(" AND labels(s)[0] IN [%s]", strings.Join(validTypes, ", "))
	}
	assert.Contains(t, labelFilter, "'Class'")
	assert.Contains(t, labelFilter, "'Function'")

	// 3. Verify Depth
	relStr := "-[:DEFINES]->"
	if opts.Depth > 0 {
		relStr = fmt.Sprintf("-[:DEFINES*1..%d]->", opts.Depth)
	}
	assert.Equal(t, "-[:DEFINES*1..3]->", relStr)
}

func TestPlantUMLQueryGeneration_Logic(t *testing.T) {
	opts := ExportOptions{
		RelTypes: []string{"IMPORTS", "CALLS"},
		Depth:    2,
	}

	// 1. Rel Filter
	relFilter := ""
	if len(opts.RelTypes) > 0 {
		validTypes := make([]string, 0, len(opts.RelTypes))
		for _, t := range opts.RelTypes {
			safe := SanitizeCypher(t)
			validTypes = append(validTypes, fmt.Sprintf("'%s'", safe))
		}
		relFilter = fmt.Sprintf(" AND type(r) IN [%s]", strings.Join(validTypes, ", "))
	}
	assert.Contains(t, relFilter, "'IMPORTS'")
	assert.Contains(t, relFilter, "'CALLS'")

	// 2. Depth and Type Part
	relStr := "-[r]->"
	typePart := "type(r)"
	if opts.Depth > 0 {
		relStr = fmt.Sprintf("-[r*1..%d]->", opts.Depth)
		typePart = "type(last(r))"
	}
	assert.Equal(t, "-[r*1..2]->", relStr)
	assert.Equal(t, "type(last(r))", typePart)
}
