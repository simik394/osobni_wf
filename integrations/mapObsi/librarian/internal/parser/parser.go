package parser

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// NoteMetadata represents parsed markdown file data
type NoteMetadata struct {
	Path       string            `json:"path"`
	Name       string            `json:"name"`
	Modified   time.Time         `json:"modified"`
	Tags       []string          `json:"tags"`
	Wikilinks  []string          `json:"wikilinks"`
	Embeds     []string          `json:"embeds"`
	Frontmatter map[string]any   `json:"frontmatter"`
}

var (
	frontmatterRe = regexp.MustCompile(`(?s)^---\n(.+?)\n---`)
	wikilinkRe    = regexp.MustCompile(`\[\[([^\]|]+)(?:\|[^\]]+)?\]\]`)
	embedRe       = regexp.MustCompile(`!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]`)
	tagRe         = regexp.MustCompile(`(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)`)
)

// ParseFile parses a markdown file and extracts metadata
func ParseFile(path string) (*NoteMetadata, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	text := string(content)
	meta := &NoteMetadata{
		Path:     path,
		Name:     strings.TrimSuffix(filepath.Base(path), ".md"),
		Modified: info.ModTime(),
	}

	// Parse frontmatter
	if match := frontmatterRe.FindStringSubmatch(text); len(match) > 1 {
		fm := make(map[string]any)
		if err := yaml.Unmarshal([]byte(match[1]), &fm); err == nil {
			meta.Frontmatter = fm
			// Extract tags from frontmatter
			if tags, ok := fm["tags"].([]any); ok {
				for _, t := range tags {
					if s, ok := t.(string); ok {
						meta.Tags = append(meta.Tags, s)
					}
				}
			}
		}
	}

	// Extract inline tags
	for _, match := range tagRe.FindAllStringSubmatch(text, -1) {
		if len(match) > 1 {
			tag := match[1]
			// Avoid duplicates
			found := false
			for _, t := range meta.Tags {
				if t == tag {
					found = true
					break
				}
			}
			if !found {
				meta.Tags = append(meta.Tags, tag)
			}
		}
	}

	// Extract wikilinks
	seen := make(map[string]bool)
	for _, match := range wikilinkRe.FindAllStringSubmatch(text, -1) {
		if len(match) > 1 && !seen[match[1]] {
			meta.Wikilinks = append(meta.Wikilinks, match[1])
			seen[match[1]] = true
		}
	}

	// Extract embeds
	seenEmbeds := make(map[string]bool)
	for _, match := range embedRe.FindAllStringSubmatch(text, -1) {
		if len(match) > 1 && !seenEmbeds[match[1]] {
			meta.Embeds = append(meta.Embeds, match[1])
			seenEmbeds[match[1]] = true
		}
	}

	return meta, nil
}
