package config

import (
	"github.com/spf13/viper"
	"log"
)

type Config struct {
	Databases DatabaseConfig `mapstructure:"databases"`
	Sync      SyncConfig     `mapstructure:"sync"`
}

type DatabaseConfig struct {
	FalkorDB FalkorConfig `mapstructure:"falkordb"`
	Memgraph Neo4jConfig  `mapstructure:"memgraph"`
	Neo4j    Neo4jConfig  `mapstructure:"neo4j"`
}

type FalkorConfig struct {
	Host   string   `mapstructure:"host"`
	Port   int      `mapstructure:"port"`
	Graphs []string `mapstructure:"graphs"`
}

type Neo4jConfig struct {
	URI      string `mapstructure:"uri"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
}

type SyncConfig struct {
	MapObsiPath   string `mapstructure:"mapObsi_path"`
	MapObsiTarget string `mapstructure:"mapObsi_target"`
	RsrchPath     string `mapstructure:"rsrch_path"`
}

func LoadConfig() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("$HOME/.config/vlt")

	// Defaults
	viper.SetDefault("databases.falkordb.host", "localhost")
	viper.SetDefault("databases.falkordb.port", 6379)
	viper.SetDefault("databases.falkordb.graphs", []string{"vault", "rsrch"})

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			log.Println("Config file not found, using defaults")
		} else {
			return nil, err
		}
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}
