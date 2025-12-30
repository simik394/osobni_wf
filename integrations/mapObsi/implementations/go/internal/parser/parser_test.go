package parser

import (
	"os"
	"path/filepath"
	"testing"
)

// TestParseMarkdown_Frontmatter tests frontmatter extraction
func TestParseMarkdown_Frontmatter(t *testing.T) {
	// Create temp file
	content := `---
title: Test Note
tags:
  - project
  - important
status: draft
---

# Main Heading

Some content here.
`
	tmpFile := createTempFile(t, "test.md", content)
	defer os.Remove(tmpFile)

	meta, err := ParseMarkdown(tmpFile)
	if err != nil {
		t.Fatalf("ParseMarkdown failed: %v", err)
	}

	// Check frontmatter tags
	if len(meta.Tags) < 2 {
		t.Errorf("Expected at least 2 tags from frontmatter, got %d: %v", len(meta.Tags), meta.Tags)
	}

	// Check frontmatter parsed correctly
	if meta.Frontmatter == nil {
		t.Fatal("Frontmatter should not be nil")
	}
	if title, ok := meta.Frontmatter["title"].(string); !ok || title != "Test Note" {
		t.Errorf("Expected frontmatter title 'Test Note', got %v", meta.Frontmatter["title"])
	}
}

// TestParseMarkdown_Wikilinks tests wikilink extraction
func TestParseMarkdown_Wikilinks(t *testing.T) {
	content := `# Note with Links

This links to [[Another Note]] and also [[Folder/Deep Note]].
Here's a link with alias [[Target|Display Text]].
And a duplicate [[Another Note]] should not appear twice.
`
	tmpFile := createTempFile(t, "links.md", content)
	defer os.Remove(tmpFile)

	meta, err := ParseMarkdown(tmpFile)
	if err != nil {
		t.Fatalf("ParseMarkdown failed: %v", err)
	}

	expected := []string{"Another Note", "Folder/Deep Note", "Target"}
	if len(meta.Wikilinks) != len(expected) {
		t.Errorf("Expected %d wikilinks, got %d: %v", len(expected), len(meta.Wikilinks), meta.Wikilinks)
	}

	for _, link := range expected {
		if !containsLink(meta.Wikilinks, link) {
			t.Errorf("Expected wikilink %q not found in %v", link, meta.Wikilinks)
		}
	}
}

// TestParseMarkdown_InlineTags tests inline tag extraction
func TestParseMarkdown_InlineTags(t *testing.T) {
	content := `# Tagged Note

This has #inline-tag and #another_tag here.
Also #nested/tag/path works.
`
	tmpFile := createTempFile(t, "tags.md", content)
	defer os.Remove(tmpFile)

	meta, err := ParseMarkdown(tmpFile)
	if err != nil {
		t.Fatalf("ParseMarkdown failed: %v", err)
	}

	expected := []string{"inline-tag", "another_tag", "nested/tag/path"}
	for _, tag := range expected {
		if !containsLink(meta.Tags, tag) {
			t.Errorf("Expected tag %q not found in %v", tag, meta.Tags)
		}
	}
}

// TestParseMarkdown_Embeds tests embed extraction
func TestParseMarkdown_Embeds(t *testing.T) {
	content := `# Note with Embeds

Here's an embedded note: ![[Embedded Note]]
And an image: ![[image.png]]
With alias: ![[diagram|300]]
`
	tmpFile := createTempFile(t, "embeds.md", content)
	defer os.Remove(tmpFile)

	meta, err := ParseMarkdown(tmpFile)
	if err != nil {
		t.Fatalf("ParseMarkdown failed: %v", err)
	}

	expected := []string{"Embedded Note", "image.png", "diagram"}
	if len(meta.Embeds) != len(expected) {
		t.Errorf("Expected %d embeds, got %d: %v", len(expected), len(meta.Embeds), meta.Embeds)
	}
}

// TestParseMarkdown_Headings tests heading extraction
func TestParseMarkdown_Headings(t *testing.T) {
	content := `# Heading 1

## Heading 2

Some text.

### Heading 3

#### Heading 4
`
	tmpFile := createTempFile(t, "headings.md", content)
	defer os.Remove(tmpFile)

	meta, err := ParseMarkdown(tmpFile)
	if err != nil {
		t.Fatalf("ParseMarkdown failed: %v", err)
	}

	if len(meta.Headings) != 4 {
		t.Errorf("Expected 4 headings, got %d", len(meta.Headings))
	}

	// Check heading levels
	expectedLevels := []int{1, 2, 3, 4}
	for i, level := range expectedLevels {
		if i < len(meta.Headings) && meta.Headings[i].Level != level {
			t.Errorf("Heading %d: expected level %d, got %d", i, level, meta.Headings[i].Level)
		}
	}
}

// TestParseMarkdown_Empty tests empty file handling
func TestParseMarkdown_Empty(t *testing.T) {
	tmpFile := createTempFile(t, "empty.md", "")
	defer os.Remove(tmpFile)

	meta, err := ParseMarkdown(tmpFile)
	if err != nil {
		t.Fatalf("ParseMarkdown failed on empty file: %v", err)
	}

	if meta.Name != "empty" {
		t.Errorf("Expected name 'empty', got %q", meta.Name)
	}
	if len(meta.Tags) != 0 {
		t.Errorf("Expected 0 tags for empty file, got %d", len(meta.Tags))
	}
}

// TestParseMarkdown_MalformedFrontmatter tests handling of broken frontmatter
func TestParseMarkdown_MalformedFrontmatter(t *testing.T) {
	content := `---
title: This has : problematic : colons
tags: [broken yaml
---

# Content
`
	tmpFile := createTempFile(t, "malformed.md", content)
	defer os.Remove(tmpFile)

	// Should not crash, just skip frontmatter
	meta, err := ParseMarkdown(tmpFile)
	if err != nil {
		t.Fatalf("ParseMarkdown should not fail on malformed frontmatter: %v", err)
	}

	// Frontmatter may be nil or empty due to parse error
	if len(meta.Headings) != 1 {
		t.Errorf("Should still parse headings, got %d", len(meta.Headings))
	}
}

// TestParseCode_Python tests Python function/class extraction
func TestParseCode_Python(t *testing.T) {
	content := `import os
from pathlib import Path

class MyClass:
    def __init__(self):
        pass

def my_function(arg1, arg2):
    # TODO: Implement this
    return None

async def async_func():
    pass
`
	tmpFile := createTempFile(t, "test.py", content)
	defer os.Remove(tmpFile)

	meta, err := ParseCode(tmpFile)
	if err != nil {
		t.Fatalf("ParseCode failed: %v", err)
	}

	if meta.Language != "python" {
		t.Errorf("Expected language 'python', got %q", meta.Language)
	}

	// Check functions (may come from TreeSitter or regex fallback)
	if len(meta.Functions) < 1 {
		t.Errorf("Expected at least 1 function, got %d", len(meta.Functions))
	}

	// Check classes
	if len(meta.Classes) < 1 {
		t.Errorf("Expected at least 1 class, got %d", len(meta.Classes))
	}

	// Check TODO extraction
	if len(meta.Tasks) < 1 {
		t.Errorf("Expected at least 1 task (TODO), got %d", len(meta.Tasks))
	}
}

// TestParseCode_Go tests Go function/struct extraction
func TestParseCode_Go(t *testing.T) {
	content := `package main

import (
	"fmt"
	"os"
)

type Config struct {
	Name string
}

func main() {
	// FIXME: This should be fixed
	fmt.Println("hello")
}

func (c *Config) Method() string {
	return c.Name
}
`
	tmpFile := createTempFile(t, "test.go", content)
	defer os.Remove(tmpFile)

	meta, err := ParseCode(tmpFile)
	if err != nil {
		t.Fatalf("ParseCode failed: %v", err)
	}

	if meta.Language != "go" {
		t.Errorf("Expected language 'go', got %q", meta.Language)
	}

	// Check imports
	if len(meta.Imports) < 2 {
		t.Errorf("Expected at least 2 imports, got %d: %v", len(meta.Imports), meta.Imports)
	}

	// Check struct as class
	if len(meta.Classes) < 1 {
		t.Errorf("Expected at least 1 struct/class, got %d", len(meta.Classes))
	}

	// Check FIXME extraction
	if len(meta.Tasks) < 1 {
		t.Errorf("Expected at least 1 task (FIXME), got %d", len(meta.Tasks))
	}
}

// TestParseCode_TypeScript tests TypeScript extraction
func TestParseCode_TypeScript(t *testing.T) {
	content := `import { Component } from 'react';
import utils from './utils';

export class MyComponent {
    render() {}
}

export function handleClick(event: Event) {
    // NOTE: This is important
    return event.target;
}

export const arrowFunc = (x: number) => x * 2;
`
	tmpFile := createTempFile(t, "test.ts", content)
	defer os.Remove(tmpFile)

	meta, err := ParseCode(tmpFile)
	if err != nil {
		t.Fatalf("ParseCode failed: %v", err)
	}

	if meta.Language != "typescript" {
		t.Errorf("Expected language 'typescript', got %q", meta.Language)
	}

	// Check functions (should include arrow function)
	if len(meta.Functions) < 1 {
		t.Errorf("Expected at least 1 function, got %d", len(meta.Functions))
	}

	// Check class
	if len(meta.Classes) < 1 {
		t.Errorf("Expected at least 1 class, got %d", len(meta.Classes))
	}
}

// TestParseAsset tests asset file metadata
func TestParseAsset(t *testing.T) {
	content := "binary content here"
	tmpFile := createTempFile(t, "image.png", content)
	defer os.Remove(tmpFile)

	meta, err := ParseAsset(tmpFile)
	if err != nil {
		t.Fatalf("ParseAsset failed: %v", err)
	}

	if meta.Type != "asset" {
		t.Errorf("Expected type 'asset', got %q", meta.Type)
	}
	if meta.Name != "image.png" {
		t.Errorf("Expected name 'image.png', got %q", meta.Name)
	}
	if meta.Size != int64(len(content)) {
		t.Errorf("Expected size %d, got %d", len(content), meta.Size)
	}
}

// TestExtensionToLanguage tests language detection
func TestExtensionToLanguage(t *testing.T) {
	cases := map[string]string{
		".py":  "python",
		".go":  "go",
		".ts":  "typescript",
		".js":  "javascript",
		".rs":  "rust",
		".jl":  "julia",
		".xyz": "unknown",
	}

	for ext, expected := range cases {
		got := extensionToLanguage(ext)
		if got != expected {
			t.Errorf("extensionToLanguage(%q): expected %q, got %q", ext, expected, got)
		}
	}
}

// TestParseTasks tests TODO/FIXME extraction
func TestParseTasks(t *testing.T) {
	content := `
// TODO: First task
# FIXME: Second task
<!-- NOTE: Third task -->
/* XXX: Fourth task */
// Not a task here
`
	tasks, err := parseTasks(content, "go")
	if err != nil {
		t.Fatalf("parseTasks failed: %v", err)
	}

	if len(tasks) < 4 {
		t.Errorf("Expected at least 4 tasks, got %d", len(tasks))
	}

	// Check statuses
	statuses := make(map[string]bool)
	for _, task := range tasks {
		statuses[task.Status] = true
	}
	for _, expected := range []string{"TODO", "FIXME", "NOTE", "XXX"} {
		if !statuses[expected] {
			t.Errorf("Expected status %q not found in tasks", expected)
		}
	}
}

// TestContains tests the contains helper
func TestContains(t *testing.T) {
	slice := []string{"a", "b", "c"}
	if !contains(slice, "b") {
		t.Error("contains should return true for existing element")
	}
	if contains(slice, "d") {
		t.Error("contains should return false for non-existing element")
	}
	if contains(nil, "a") {
		t.Error("contains should return false for nil slice")
	}
}

// Helper functions

func createTempFile(t *testing.T, name, content string) string {
	t.Helper()
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, name)
	if err := os.WriteFile(tmpFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	return tmpFile
}

func containsLink(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
