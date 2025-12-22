package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	VaultPath     string
	FalkorDBAddr  string
	FalkorDBGraph string
	DebounceMs    int
}

func DefaultConfig() *Config {
	home, _ := os.UserHomeDir()
	return &Config{
		VaultPath:     filepath.Join(home, "Obsi"),
		FalkorDBAddr:  "localhost:6379",
		FalkorDBGraph: "vault",
		DebounceMs:    100,
	}
}

func (c *Config) FromEnv() *Config {
	if v := os.Getenv("VAULT_PATH"); v != "" {
		c.VaultPath = v
	}
	if v := os.Getenv("FALKORDB_ADDR"); v != "" {
		c.FalkorDBAddr = v
	}
	if v := os.Getenv("FALKORDB_GRAPH"); v != "" {
		c.FalkorDBGraph = v
	}
	return c
}
