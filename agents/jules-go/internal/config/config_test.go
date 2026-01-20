package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad(t *testing.T) {
	// Create a temporary directory for the test
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "config.yaml")

	// Test case 1: Load from YAML
	yamlContent := `
jules_api_key: "yaml_api_key"
browser_path: "/path/from/yaml"
falkordb_url: "yaml:falkordb:url"
max_concurrent_sessions: 20
webhook_port: 9090
log_level: "debug"
`
	if err := os.WriteFile(configPath, []byte(yamlContent), 0600); err != nil {
		t.Fatalf("failed to write test config file: %v", err)
	}

	cfg, err := Load(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.JulesAPIKey != "yaml_api_key" {
		t.Errorf("expected JulesAPIKey to be 'yaml_api_key', got '%s'", cfg.JulesAPIKey)
	}
	if cfg.BrowserPath != "/path/from/yaml" {
		t.Errorf("expected BrowserPath to be '/path/from/yaml', got '%s'", cfg.BrowserPath)
	}
	if cfg.FalkorDBURL != "yaml:falkordb:url" {
		t.Errorf("expected FalkorDBURL to be 'yaml:falkordb:url', got '%s'", cfg.FalkorDBURL)
	}
	if cfg.MaxConcurrentSessions != 20 {
		t.Errorf("expected MaxConcurrentSessions to be 20, got %d", cfg.MaxConcurrentSessions)
	}
	if cfg.WebhookPort != 9090 {
		t.Errorf("expected WebhookPort to be 9090, got %d", cfg.WebhookPort)
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("expected LogLevel to be 'debug', got '%s'", cfg.LogLevel)
	}

	// Test case 2: Override with environment variables
	os.Setenv("JULES_API_KEY", "env_api_key")
	os.Setenv("BROWSER_PATH", "/path/from/env")
	os.Setenv("MAX_CONCURRENT_SESSIONS", "30")

	cfg, err = Load(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.JulesAPIKey != "env_api_key" {
		t.Errorf("expected JulesAPIKey to be 'env_api_key', got '%s'", cfg.JulesAPIKey)
	}
	if cfg.BrowserPath != "/path/from/env" {
		t.Errorf("expected BrowserPath to be '/path/from/env', got '%s'", cfg.BrowserPath)
	}
	if cfg.MaxConcurrentSessions != 30 {
		t.Errorf("expected MaxConcurrentSessions to be 30, got %d", cfg.MaxConcurrentSessions)
	}

	os.Unsetenv("JULES_API_KEY")
	os.Unsetenv("BROWSER_PATH")
	os.Unsetenv("MAX_CONCURRENT_SESSIONS")

	// Test case 3: Required JulesAPIKey
	if err := os.Remove(configPath); err != nil {
		t.Fatalf("failed to remove test config file: %v", err)
	}
	_, err = Load(configPath)
	if err == nil {
		t.Error("expected an error when JULES_API_KEY is not set, but got nil")
	}

	// Test case 4: Default values
	os.Setenv("JULES_API_KEY", "test_key")
	cfg, err = Load("non_existent_file.yaml")
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}
	if cfg.MaxConcurrentSessions != 15 {
		t.Errorf("expected MaxConcurrentSessions to be 15, got %d", cfg.MaxConcurrentSessions)
	}
	if cfg.WebhookPort != 8090 {
		t.Errorf("expected WebhookPort to be 8090, got %d", cfg.WebhookPort)
	}
	os.Unsetenv("JULES_API_KEY")
}
