
package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

// Config holds the application configuration.
type Config struct {
	JulesAPIKey         string `yaml:"jules_api_key"`
	BrowserPath         string `yaml:"browser_path"`
	FalkorDBURL         string `yaml:"falkordb_url"`
	MaxConcurrentSessions int    `yaml:"max_concurrent_sessions"`
	WebhookPort         int    `yaml:"webhook_port"`
	LogLevel            string `yaml:"log_level"`
	LogFormat           string `yaml:"log_format"`
}

// Load loads the configuration from a YAML file and environment variables.
func Load(path string) (*Config, error) {
	// Load .env file if it exists
	_ = godotenv.Load()

	config := &Config{
		MaxConcurrentSessions: 15,
		WebhookPort:         8090,
	}

	// Read the YAML file
	data, err := os.ReadFile(path)
	if err != nil {
		// If the file doesn't exist, we can proceed with env vars and defaults
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
	} else {
		// Unmarshal the YAML data into the Config struct
		err = yaml.Unmarshal(data, config)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal config file: %w", err)
		}
	}

	// Override with environment variables
	if apiKey, exists := os.LookupEnv("JULES_API_KEY"); exists {
		config.JulesAPIKey = apiKey
	}
	if browserPath, exists := os.LookupEnv("BROWSER_PATH"); exists {
		config.BrowserPath = browserPath
	}
	if falkorDBURL, exists := os.LookupEnv("FALKORDB_URL"); exists {
		config.FalkorDBURL = falkorDBURL
	}
	if maxConcurrentSessions, exists := os.LookupEnv("MAX_CONCURRENT_SESSIONS"); exists {
		if val, err := strconv.Atoi(maxConcurrentSessions); err == nil {
			config.MaxConcurrentSessions = val
		}
	}
	if webhookPort, exists := os.LookupEnv("WEBHOOK_PORT"); exists {
		if val, err := strconv.Atoi(webhookPort); err == nil {
			config.WebhookPort = val
		}
	}
	if logLevel, exists := os.LookupEnv("LOG_LEVEL"); exists {
		config.LogLevel = logLevel
	}
	if logFormat, exists := os.LookupEnv("LOG_FORMAT"); exists {
		config.LogFormat = logFormat
	}

	// Validate required fields
	if config.JulesAPIKey == "" {
		return nil, fmt.Errorf("JULES_API_KEY is required")
	}

	return config, nil
}
