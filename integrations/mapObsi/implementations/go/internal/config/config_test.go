package config

import (
	"os"
	"path/filepath"
	"testing"
)

// TestDefaultConfig tests that default config is populated correctly
func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	// Check sources
	if len(cfg.Sources) == 0 {
		t.Fatal("DefaultConfig should have at least one source")
	}
	if !cfg.Sources[0].Enabled {
		t.Error("First source should be enabled by default")
	}

	// Check markdown processing
	if !cfg.Processing.Markdown.Enabled {
		t.Error("Markdown processing should be enabled by default")
	}
	if len(cfg.Processing.Markdown.Extensions) < 1 {
		t.Error("Markdown should have default extensions")
	}

	// Check database defaults
	if cfg.Database.Addr == "" {
		t.Error("Database address should have a default")
	}
	if cfg.Database.Graph == "" {
		t.Error("Database graph should have a default")
	}

	// Check watcher defaults
	if cfg.Watcher.DebounceMs <= 0 {
		t.Error("Watcher debounce should be positive")
	}

	// Check global ignore patterns
	if len(cfg.GlobalIgnore.Patterns) == 0 {
		t.Error("Global ignore should have default patterns")
	}
}

// TestLoadConfig_FileExists tests loading from a valid config file
func TestLoadConfig_FileExists(t *testing.T) {
	configContent := `
sources:
  - name: test-vault
    path: /tmp/test-vault
    enabled: true
database:
  addr: localhost:7777
  graph: test-graph
`
	tmpFile := createTempConfig(t, configContent)
	defer os.Remove(tmpFile)

	cfg, err := LoadConfig(tmpFile)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	// Check custom values were applied
	if cfg.Database.Addr != "localhost:7777" {
		t.Errorf("Expected addr 'localhost:7777', got %q", cfg.Database.Addr)
	}
	if cfg.Database.Graph != "test-graph" {
		t.Errorf("Expected graph 'test-graph', got %q", cfg.Database.Graph)
	}

	// Check sources
	if len(cfg.Sources) == 0 || cfg.Sources[0].Name != "test-vault" {
		t.Error("Sources should be loaded from config file")
	}
}

// TestLoadConfig_FileNotExists tests fallback to defaults
func TestLoadConfig_FileNotExists(t *testing.T) {
	cfg, err := LoadConfig("/non/existent/config.yaml")
	if err != nil {
		t.Fatalf("LoadConfig should not fail for non-existent file: %v", err)
	}

	// Should return defaults
	if len(cfg.Sources) == 0 {
		t.Error("Should return default config when file doesn't exist")
	}
}

// TestLoadConfig_TildeExpansion tests ~ expansion in paths
func TestLoadConfig_TildeExpansion(t *testing.T) {
	configContent := `
sources:
  - name: home-vault
    path: ~/my-vault
    enabled: true
`
	tmpFile := createTempConfig(t, configContent)
	defer os.Remove(tmpFile)

	cfg, err := LoadConfig(tmpFile)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	home, _ := os.UserHomeDir()
	expected := filepath.Join(home, "my-vault")
	if cfg.Sources[0].Path != expected {
		t.Errorf("Expected expanded path %q, got %q", expected, cfg.Sources[0].Path)
	}
}

// TestFromEnv tests environment variable overrides
func TestFromEnv(t *testing.T) {
	// Set test environment variables
	os.Setenv("VAULT_PATH", "/env/vault")
	os.Setenv("FALKORDB_ADDR", "localhost:9999")
	os.Setenv("FALKORDB_GRAPH", "env-graph")
	os.Setenv("WINDMILL_WEBHOOK_URL", "https://test.windmill/webhook")
	os.Setenv("WINDMILL_TOKEN", "test-token")
	defer func() {
		os.Unsetenv("VAULT_PATH")
		os.Unsetenv("FALKORDB_ADDR")
		os.Unsetenv("FALKORDB_GRAPH")
		os.Unsetenv("WINDMILL_WEBHOOK_URL")
		os.Unsetenv("WINDMILL_TOKEN")
	}()

	cfg := DefaultConfig().FromEnv()

	if cfg.Sources[0].Path != "/env/vault" {
		t.Errorf("VAULT_PATH not applied, got %q", cfg.Sources[0].Path)
	}
	if cfg.Database.Addr != "localhost:9999" {
		t.Errorf("FALKORDB_ADDR not applied, got %q", cfg.Database.Addr)
	}
	if cfg.Database.Graph != "env-graph" {
		t.Errorf("FALKORDB_GRAPH not applied, got %q", cfg.Database.Graph)
	}
	if cfg.Windmill.WebhookURL != "https://test.windmill/webhook" {
		t.Errorf("WINDMILL_WEBHOOK_URL not applied, got %q", cfg.Windmill.WebhookURL)
	}
	if cfg.Windmill.Token != "test-token" {
		t.Errorf("WINDMILL_TOKEN not applied, got %q", cfg.Windmill.Token)
	}
}

// TestGetPrimaryVaultPath tests primary vault path retrieval
func TestGetPrimaryVaultPath(t *testing.T) {
	cfg := &Config{
		Sources: []SourceConfig{
			{Name: "disabled", Path: "/disabled", Enabled: false},
			{Name: "enabled", Path: "/enabled", Enabled: true},
		},
	}

	path := cfg.GetPrimaryVaultPath()
	if path != "/enabled" {
		t.Errorf("Expected first enabled source '/enabled', got %q", path)
	}
}

// TestGetPrimaryVaultPath_NoEnabled tests when no source is enabled
func TestGetPrimaryVaultPath_NoEnabled(t *testing.T) {
	cfg := &Config{
		Sources: []SourceConfig{
			{Name: "disabled1", Path: "/path1", Enabled: false},
			{Name: "disabled2", Path: "/path2", Enabled: false},
		},
	}

	path := cfg.GetPrimaryVaultPath()
	if path != "" {
		t.Errorf("Expected empty string when no source enabled, got %q", path)
	}
}

// TestShouldProcess_Markdown tests markdown file detection
func TestShouldProcess_Markdown(t *testing.T) {
	cfg := DefaultConfig()

	fileType, should := cfg.ShouldProcess("/vault/notes/test.md")
	if !should || fileType != "markdown" {
		t.Errorf(".md should be processed as markdown, got should=%v, type=%q", should, fileType)
	}

	fileType, should = cfg.ShouldProcess("/vault/notes/test.markdown")
	if !should || fileType != "markdown" {
		t.Errorf(".markdown should be processed as markdown, got should=%v, type=%q", should, fileType)
	}
}

// TestShouldProcess_Code tests code file detection
func TestShouldProcess_Code(t *testing.T) {
	cfg := DefaultConfig()

	testCases := []string{".py", ".go", ".ts", ".js", ".rs"}
	for _, ext := range testCases {
		fileType, should := cfg.ShouldProcess("/vault/src/file" + ext)
		if !should || fileType != "code" {
			t.Errorf("%s should be processed as code, got should=%v, type=%q", ext, should, fileType)
		}
	}
}

// TestShouldProcess_Asset tests asset file detection
func TestShouldProcess_Asset(t *testing.T) {
	cfg := DefaultConfig()

	testCases := []string{".pdf", ".png", ".jpg", ".mp3"}
	for _, ext := range testCases {
		fileType, should := cfg.ShouldProcess("/vault/assets/file" + ext)
		if !should || fileType != "asset" {
			t.Errorf("%s should be processed as asset, got should=%v, type=%q", ext, should, fileType)
		}
	}
}

// TestShouldProcess_Unknown tests unknown extensions
func TestShouldProcess_Unknown(t *testing.T) {
	cfg := DefaultConfig()

	_, should := cfg.ShouldProcess("/vault/file.xyz")
	if should {
		t.Error("Unknown extension should not be processed")
	}
}

// TestShouldProcess_GlobalIgnore tests global ignore patterns
func TestShouldProcess_GlobalIgnore(t *testing.T) {
	cfg := DefaultConfig()

	// Test .git directory exclusion
	_, should := cfg.ShouldProcess("/vault/.git/config")
	if should {
		t.Error(".git files should be ignored")
	}

	// Test .obsidian exclusion
	_, should = cfg.ShouldProcess("/vault/.obsidian/plugins/test.json")
	if should {
		t.Error(".obsidian files should be ignored")
	}
}

// TestShouldProcess_CodeExclude tests code-specific excludes
func TestShouldProcess_CodeExclude(t *testing.T) {
	cfg := DefaultConfig()

	// Test node_modules exclusion
	_, should := cfg.ShouldProcess("/project/node_modules/package/index.js")
	if should {
		t.Error("node_modules .js files should be excluded")
	}

	// Test __pycache__ exclusion
	_, should = cfg.ShouldProcess("/project/__pycache__/module.py")
	if should {
		t.Error("__pycache__ .py files should be excluded")
	}
}

// TestMatchGlob tests glob pattern matching
func TestMatchGlob(t *testing.T) {
	cases := []struct {
		pattern string
		path    string
		expect  bool
	}{
		{"**/.git/**", "/vault/.git/config", true},
		{"**/.git/**", "/vault/notes/test.md", false},
		{"*.md", "test.md", true},
		{"*.md", "test.txt", false},
		{"**/node_modules/**", "/project/node_modules/pkg/index.js", true},
		{"**/node_modules/**", "/project/src/index.js", false},
	}

	for _, tc := range cases {
		got := MatchGlob(tc.pattern, tc.path)
		if got != tc.expect {
			t.Errorf("MatchGlob(%q, %q) = %v, want %v", tc.pattern, tc.path, got, tc.expect)
		}
	}
}

// TestLoadConfig_MalformedYAML tests handling of invalid YAML
func TestLoadConfig_MalformedYAML(t *testing.T) {
	configContent := `
sources:
  - name: [invalid yaml
  broken: yes
`
	tmpFile := createTempConfig(t, configContent)
	defer os.Remove(tmpFile)

	_, err := LoadConfig(tmpFile)
	if err == nil {
		t.Error("LoadConfig should fail on malformed YAML")
	}
}

// Helper function
func createTempConfig(t *testing.T, content string) string {
	t.Helper()
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "config.yaml")
	if err := os.WriteFile(tmpFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to create temp config: %v", err)
	}
	return tmpFile
}
