package config

import (
	"os"
	"path/filepath"

	"github.com/bmatcuk/doublestar/v4"
	"gopkg.in/yaml.v3"
)

// Config holds all librarian configuration
type Config struct {
	VaultPath   string         `yaml:"vault_path"`
	FalkorDB    FalkorDBConfig `yaml:"falkordb"`
	DebounceMs  int            `yaml:"debounce_ms"`
	Files       FilesConfig    `yaml:"files"`
	GlobalExclude []string     `yaml:"global_exclude"`
}

type FalkorDBConfig struct {
	Addr  string `yaml:"addr"`
	Graph string `yaml:"graph"`
}

type FilesConfig struct {
	Markdown FileTypeConfig `yaml:"markdown"`
	Code     FileTypeConfig `yaml:"code"`
	Assets   FileTypeConfig `yaml:"assets"`
}

type FileTypeConfig struct {
	Extensions []string `yaml:"extensions"`
	Extract    []string `yaml:"extract"`
	Include    []string `yaml:"include"`
	Exclude    []string `yaml:"exclude"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	home, _ := os.UserHomeDir()
	return &Config{
		VaultPath: filepath.Join(home, "Obsi"),
		FalkorDB: FalkorDBConfig{
			Addr:  "localhost:6379",
			Graph: "vault",
		},
		DebounceMs: 100,
		Files: FilesConfig{
			Markdown: FileTypeConfig{
				Extensions: []string{".md"},
				Extract:    []string{"frontmatter", "wikilinks", "tags", "embeds", "headings"},
			},
			Code: FileTypeConfig{
				Extensions: []string{".py", ".go", ".ts", ".js", ".rs", ".jl"},
				Extract:    []string{"functions", "classes", "imports"},
				Include:    []string{}, // Empty = include all
				Exclude: []string{
					"**/node_modules/**",
					"**/.venv/**",
					"**/vendor/**",
					"**/__pycache__/**",
				},
			},
			Assets: FileTypeConfig{
				Extensions: []string{".pdf", ".png", ".jpg", ".mp3"},
				Extract:    []string{},
			},
		},
		GlobalExclude: []string{
			"**/.git/**",
			"**/.obsidian/**",
		},
	}
}

// LoadConfig loads configuration from file
func LoadConfig(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil // Use defaults if no config file
		}
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	// Expand ~ in vault path
	if len(cfg.VaultPath) > 0 && cfg.VaultPath[0] == '~' {
		home, _ := os.UserHomeDir()
		cfg.VaultPath = filepath.Join(home, cfg.VaultPath[1:])
	}

	return cfg, nil
}

// FromEnv applies environment variable overrides
func (c *Config) FromEnv() *Config {
	if v := os.Getenv("VAULT_PATH"); v != "" {
		c.VaultPath = v
	}
	if v := os.Getenv("FALKORDB_ADDR"); v != "" {
		c.FalkorDB.Addr = v
	}
	if v := os.Getenv("FALKORDB_GRAPH"); v != "" {
		c.FalkorDB.Graph = v
	}
	return c
}

// ShouldProcess checks if a file should be processed based on config
func (c *Config) ShouldProcess(path string) (fileType string, should bool) {
	// Check global excludes first
	for _, pattern := range c.GlobalExclude {
		if MatchGlob(pattern, path) {
			return "", false
		}
	}

	ext := filepath.Ext(path)

	// Check markdown
	for _, e := range c.Files.Markdown.Extensions {
		if ext == e {
			return "markdown", true
		}
	}

	// Check code files
	for _, e := range c.Files.Code.Extensions {
		if ext == e {
			// Check include patterns
			if len(c.Files.Code.Include) > 0 {
				included := false
				for _, pattern := range c.Files.Code.Include {
					if MatchGlob(pattern, path) {
						included = true
						break
					}
				}
				if !included {
					return "", false
				}
			}

			// Check exclude patterns
			for _, pattern := range c.Files.Code.Exclude {
				if MatchGlob(pattern, path) {
					return "", false
				}
			}

			return "code", true
		}
	}

	// Check assets
	for _, e := range c.Files.Assets.Extensions {
		if ext == e {
			return "asset", true
		}
	}

	return "", false
}

// MatchGlob performs glob matching, handling ** patterns via doublestar library
func MatchGlob(pattern, path string) bool {
	matched, _ := doublestar.Match(pattern, path)
	return matched
}
