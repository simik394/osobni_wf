package parser

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// FileMetadata is the base interface for all file types
type FileMetadata interface {
	GetPath() string
	GetType() string
}

// NoteMetadata represents parsed markdown file data
type NoteMetadata struct {
	Path        string         `json:"path"`
	Type        string         `json:"type"` // "note"
	Name        string         `json:"name"`
	Modified    time.Time      `json:"modified"`
	Tags        []string       `json:"tags"`
	Wikilinks   []string       `json:"wikilinks"`
	Embeds      []string       `json:"embeds"`
	Headings    []Heading      `json:"headings"`
	Frontmatter map[string]any `json:"frontmatter"`
}

func (n *NoteMetadata) GetPath() string { return n.Path }
func (n *NoteMetadata) GetType() string { return "note" }

// Heading represents a markdown heading
type Heading struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
	Line  int    `json:"line"`
}

// CodeMetadata represents parsed code file data
type CodeMetadata struct {
	Path      string     `json:"path"`
	Type      string     `json:"type"` // "code"
	Name      string     `json:"name"`
	Language  string     `json:"language"`
	Modified  time.Time  `json:"modified"`
	Functions []Function `json:"functions"`
	Classes   []Class    `json:"classes"`
	Imports   []string   `json:"imports"`
}

func (c *CodeMetadata) GetPath() string { return c.Path }
func (c *CodeMetadata) GetType() string { return "code" }

// Function represents a function/method definition
type Function struct {
	Name      string `json:"name"`
	Line      int    `json:"line"`
	Signature string `json:"signature"`
}

// Class represents a class/struct definition
type Class struct {
	Name    string   `json:"name"`
	Line    int      `json:"line"`
	Methods []string `json:"methods"`
}

// AssetMetadata represents non-parsed asset files
type AssetMetadata struct {
	Path     string    `json:"path"`
	Type     string    `json:"type"` // "asset"
	Name     string    `json:"name"`
	Modified time.Time `json:"modified"`
	Size     int64     `json:"size"`
}

func (a *AssetMetadata) GetPath() string { return a.Path }
func (a *AssetMetadata) GetType() string { return "asset" }

// Regex patterns for markdown
var (
	frontmatterRe = regexp.MustCompile(`(?s)^---\n(.+?)\n---`)
	wikilinkRe    = regexp.MustCompile(`\[\[([^\]|]+)(?:\|[^\]]+)?\]\]`)
	embedRe       = regexp.MustCompile(`!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]`)
	tagRe         = regexp.MustCompile(`(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)`)
	headingRe     = regexp.MustCompile(`^(#{1,6})\s+(.+)$`)
)

// Regex patterns for code files (language-agnostic basics)
var (
	// Python
	pyFuncRe   = regexp.MustCompile(`^\s*def\s+(\w+)\s*\(([^)]*)\)`)
	pyClassRe  = regexp.MustCompile(`^\s*class\s+(\w+)`)
	pyImportRe = regexp.MustCompile(`^(?:from\s+[\w.]+\s+)?import\s+(.+)`)

	// Go
	goFuncRe   = regexp.MustCompile(`^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]*)\)`)
	goTypeRe   = regexp.MustCompile(`^type\s+(\w+)\s+struct`)
	goImportRe = regexp.MustCompile(`^\s*"([^"]+)"`)

	// TypeScript/JavaScript
	tsFuncRe    = regexp.MustCompile(`^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)`)
	tsClassRe   = regexp.MustCompile(`^(?:export\s+)?class\s+(\w+)`)
	tsArrowRe   = regexp.MustCompile(`^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>`)
	tsImportRe  = regexp.MustCompile(`^import\s+.+\s+from\s+['"]([^'"]+)['"]`)

	// Rust
	rsFuncRe   = regexp.MustCompile(`^(?:pub\s+)?fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)`)
	rsStructRe = regexp.MustCompile(`^(?:pub\s+)?struct\s+(\w+)`)
	rsUseRe    = regexp.MustCompile(`^use\s+(.+);`)
)

// ParseMarkdown parses a markdown file
func ParseMarkdown(path string) (*NoteMetadata, error) {
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
		Type:     "note",
		Name:     strings.TrimSuffix(filepath.Base(path), ".md"),
		Modified: info.ModTime(),
	}

	// Parse frontmatter
	if match := frontmatterRe.FindStringSubmatch(text); len(match) > 1 {
		fm := make(map[string]any)
		if err := yaml.Unmarshal([]byte(match[1]), &fm); err == nil {
			meta.Frontmatter = fm
			if tags, ok := fm["tags"].([]any); ok {
				for _, t := range tags {
					if s, ok := t.(string); ok {
						meta.Tags = append(meta.Tags, s)
					}
				}
			}
		}
	}

	lines := strings.Split(text, "\n")
	for i, line := range lines {
		// Extract headings
		if match := headingRe.FindStringSubmatch(line); len(match) > 2 {
			meta.Headings = append(meta.Headings, Heading{
				Level: len(match[1]),
				Text:  match[2],
				Line:  i + 1,
			})
		}
	}

	// Extract inline tags
	for _, match := range tagRe.FindAllStringSubmatch(text, -1) {
		if len(match) > 1 && !contains(meta.Tags, match[1]) {
			meta.Tags = append(meta.Tags, match[1])
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

// ParseCode parses a code file based on its extension
func ParseCode(path string) (*CodeMetadata, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	ext := filepath.Ext(path)
	lang := extensionToLanguage(ext)

	meta := &CodeMetadata{
		Path:     path,
		Type:     "code",
		Name:     filepath.Base(path),
		Language: lang,
		Modified: info.ModTime(),
	}

	lines := strings.Split(string(content), "\n")

	switch lang {
	case "python":
		parsePython(lines, meta)
	case "go":
		parseGo(lines, meta)
	case "typescript", "javascript":
		parseTypeScript(lines, meta)
	case "rust":
		parseRust(lines, meta)
	default:
		// Generic parsing - just count lines
	}

	return meta, nil
}

// ParseAsset creates metadata for asset files
func ParseAsset(path string) (*AssetMetadata, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	return &AssetMetadata{
		Path:     path,
		Type:     "asset",
		Name:     filepath.Base(path),
		Modified: info.ModTime(),
		Size:     info.Size(),
	}, nil
}

func parsePython(lines []string, meta *CodeMetadata) {
	for i, line := range lines {
		if match := pyFuncRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Functions = append(meta.Functions, Function{
				Name:      match[1],
				Line:      i + 1,
				Signature: strings.TrimSpace(line),
			})
		}
		if match := pyClassRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Classes = append(meta.Classes, Class{
				Name: match[1],
				Line: i + 1,
			})
		}
		if match := pyImportRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Imports = append(meta.Imports, strings.TrimSpace(match[1]))
		}
	}
}

func parseGo(lines []string, meta *CodeMetadata) {
	inImport := false
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "import (") {
			inImport = true
			continue
		}
		if inImport && strings.TrimSpace(line) == ")" {
			inImport = false
			continue
		}
		if inImport {
			if match := goImportRe.FindStringSubmatch(line); len(match) > 1 {
				meta.Imports = append(meta.Imports, match[1])
			}
		}
		if match := goFuncRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Functions = append(meta.Functions, Function{
				Name:      match[1],
				Line:      i + 1,
				Signature: strings.TrimSpace(line),
			})
		}
		if match := goTypeRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Classes = append(meta.Classes, Class{
				Name: match[1],
				Line: i + 1,
			})
		}
	}
}

func parseTypeScript(lines []string, meta *CodeMetadata) {
	for i, line := range lines {
		if match := tsFuncRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Functions = append(meta.Functions, Function{
				Name:      match[1],
				Line:      i + 1,
				Signature: strings.TrimSpace(line),
			})
		}
		if match := tsArrowRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Functions = append(meta.Functions, Function{
				Name:      match[1],
				Line:      i + 1,
				Signature: strings.TrimSpace(line),
			})
		}
		if match := tsClassRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Classes = append(meta.Classes, Class{
				Name: match[1],
				Line: i + 1,
			})
		}
		if match := tsImportRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Imports = append(meta.Imports, match[1])
		}
	}
}

func parseRust(lines []string, meta *CodeMetadata) {
	for i, line := range lines {
		if match := rsFuncRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Functions = append(meta.Functions, Function{
				Name:      match[1],
				Line:      i + 1,
				Signature: strings.TrimSpace(line),
			})
		}
		if match := rsStructRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Classes = append(meta.Classes, Class{
				Name: match[1],
				Line: i + 1,
			})
		}
		if match := rsUseRe.FindStringSubmatch(line); len(match) > 1 {
			meta.Imports = append(meta.Imports, match[1])
		}
	}
}

func extensionToLanguage(ext string) string {
	switch ext {
	case ".py":
		return "python"
	case ".go":
		return "go"
	case ".ts":
		return "typescript"
	case ".js":
		return "javascript"
	case ".rs":
		return "rust"
	case ".jl":
		return "julia"
	default:
		return "unknown"
	}
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// ParseFile is the legacy function for backwards compatibility
func ParseFile(path string) (*NoteMetadata, error) {
	return ParseMarkdown(path)
}
