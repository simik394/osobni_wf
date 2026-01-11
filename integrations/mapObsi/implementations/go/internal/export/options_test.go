package export

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDefaultExportOptions(t *testing.T) {
	opts := DefaultExportOptions()
	assert.Equal(t, "medium", opts.Detail)
	assert.Equal(t, []string{"node_modules", "vendor", ".git"}, opts.Excludes)
	assert.Empty(t, opts.NodeTypes)
	assert.Empty(t, opts.RelTypes)
	assert.Equal(t, 0, opts.Depth)
}

func TestShouldInclude(t *testing.T) {
	opts := DefaultExportOptions()

	assert.True(t, opts.ShouldInclude("src/main.go"))
	assert.False(t, opts.ShouldInclude("node_modules/pkg/main.js"))
	assert.False(t, opts.ShouldInclude("vendor/lib.go"))
	assert.False(t, opts.ShouldInclude(".git/config"))
}

func TestOptions_Filters(t *testing.T) {
	opts := DefaultExportOptions()
	opts.NodeTypes = []string{"Class", "Function"}

	// Just verify the struct holds values
	assert.Contains(t, opts.NodeTypes, "Class")
	assert.Contains(t, opts.NodeTypes, "Function")
}
