package config

import (
	"os"
	"path/filepath"

	"github.com/bmatcuk/doublestar/v4"
	"gopkg.in/yaml.v3"
)

// Config holds all librarian configuration
type Config struct {
	Sources       []SourceConfig    `yaml:"sources"`
	Processing    ProcessingConfig  `yaml:"processing"`
	Database      DatabaseConfig    `yaml:"database"`
	Watcher       WatcherConfig     `yaml:"watcher"`
	GlobalIgnore  GlobalIgnoreConfig `yaml:"global_ignore"`
	ProjectRoots  []string          `yaml:"project_roots"`
	Windmill      WindmillConfig    `yaml:"windmill"`
}

type WindmillConfig struct {
	WebhookURL string `yaml:"webhook_url"`
	Token      string `yaml:"token"`
}

type SourceConfig struct {
	Name     string `yaml:"name"`
	Path     string `yaml:"path"`
	Enabled  bool   `yaml:"enabled"`
	Priority int    `yaml:"priority"`
}

type ProcessingConfig struct {
	Markdown FileTypeConfig `yaml:"markdown"`
	Code     FileTypeConfig `yaml:"code"`
	Assets   FileTypeConfig `yaml:"assets"`
}

type FileTypeConfig struct {
	Extensions []string `yaml:"extensions"`
	Extract    []string `yaml:"extract"`
	Include    []string `yaml:"include"`
	Exclude    []string `yaml:"exclude"`
	Enabled    bool     `yaml:"enabled"`
}

type DatabaseConfig struct {
	Type      string `yaml:"type"`
	Addr      string `yaml:"addr"`
	Graph     string `yaml:"graph"`
	BatchSize int    `yaml:"batch_size"`
}

type WatcherConfig struct {
	DebounceMs       int  `yaml:"debounce_ms"`
	Realtime         bool `yaml:"realtime"`
	RescanInterval   int  `yaml:"rescan_interval"`
}

type GlobalIgnoreConfig struct {
	Patterns    []string `yaml:"patterns"`
	MaxFileSize int64    `yaml:"max_file_size"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	home, _ := os.UserHomeDir()
	return &Config{
		Sources: []SourceConfig{
			{
				Name:    "main-vault",
				Path:    filepath.Join(home, "Obsi"),
				Enabled: true,
			},
		},
		Processing: ProcessingConfig{
			Markdown: FileTypeConfig{
				Extensions: []string{".md", ".markdown"},
				Enabled:    true,
				Extract:    []string{"frontmatter", "wikilinks", "tags", "embeds", "headings"},
			},
			Code: FileTypeConfig{
				Extensions: []string{".py", ".go", ".ts", ".js", ".rs", ".jl"},
				Enabled:    true,
				Extract:    []string{"functions", "classes", "imports"},
				Exclude: []string{
					"**/node_modules/**",
					"**/.venv/**",
					"**/vendor/**",
					"**/__pycache__/**",
				},
			},
			Assets: FileTypeConfig{
				Extensions: []string{".pdf", ".png", ".jpg", ".mp3"},
				Enabled:    true,
			},
		},
		Database: DatabaseConfig{
			Type:      "falkordb",
			Addr:      "localhost:6379",
			Graph:     "vault",
			BatchSize: 100,
		},
		Watcher: WatcherConfig{
			DebounceMs: 100,
			Realtime:   true,
		},
		GlobalIgnore: GlobalIgnoreConfig{
			Patterns: []string{
				"**/.git/**",
				"**/.obsidian/**",
				"**/.trash/**",
			},
			MaxFileSize: 10 * 1024 * 1024,
		},
		ProjectRoots: []string{"Prods"},
	}
}

// LoadConfig loads configuration from file
func LoadConfig(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil // Use defaults
		}
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	// Expand ~ in source paths
	for i := range cfg.Sources {
		if len(cfg.Sources[i].Path) > 0 && cfg.Sources[i].Path[0] == '~' {
			home, _ := os.UserHomeDir()
			cfg.Sources[i].Path = filepath.Join(home, cfg.Sources[i].Path[1:])
		}
	}

	return cfg, nil
}

// FromEnv applies environment variable overrides
func (c *Config) FromEnv() *Config {
	if v := os.Getenv("VAULT_PATH"); v != "" {
		if len(c.Sources) > 0 {
			c.Sources[0].Path = v
		}
	}
	if v := os.Getenv("FALKORDB_ADDR"); v != "" {
		c.Database.Addr = v
	}
	if v := os.Getenv("FALKORDB_GRAPH"); v != "" {
		c.Database.Graph = v
	}
	if v := os.Getenv("WINDMILL_WEBHOOK_URL"); v != "" {
		c.Windmill.WebhookURL = v
	}
	if v := os.Getenv("WINDMILL_TOKEN"); v != "" {
		c.Windmill.Token = v
	}
	return c
}

// GetPrimaryVaultPath returns the path of the first enabled source
func (c *Config) GetPrimaryVaultPath() string {
	for _, s := range c.Sources {
		if s.Enabled {
			return s.Path
		}
	}
	return ""
}

// ShouldProcess checks if a file should be processed based on config
func (c *Config) ShouldProcess(path string) (fileType string, should bool) {
	// Check global excludes first
	for _, pattern := range c.GlobalIgnore.Patterns {
		if MatchGlob(pattern, path) {
			return "", false
		}
	}

	ext := filepath.Ext(path)

	// Check markdown
	if c.Processing.Markdown.Enabled {
		for _, e := range c.Processing.Markdown.Extensions {
			if ext == e {
				return "markdown", true
			}
		}
	}

	// Check code files
	if c.Processing.Code.Enabled {
		for _, e := range c.Processing.Code.Extensions {
			if ext == e {
				// Check include/exclude logic
				if len(c.Processing.Code.Include) > 0 {
					included := false
					for _, pattern := range c.Processing.Code.Include {
						if MatchGlob(pattern, path) {
							included = true
							break
						}
					}
					if !included {
						return "", false
					}
				}

				for _, pattern := range c.Processing.Code.Exclude {
					if MatchGlob(pattern, path) {
						return "", false
					}
				}

				return "code", true
			}
		}
	}

	// Check assets
	if c.Processing.Assets.Enabled {
		for _, e := range c.Processing.Assets.Extensions {
			if ext == e {
				return "asset", true
			}
		}
	}

	return "", false
}

// MatchGlob performs glob matching
func MatchGlob(pattern, path string) bool {
	matched, _ := doublestar.Match(pattern, path)
	return matched
}
