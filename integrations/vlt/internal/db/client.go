package db

import (
	"context"
	"fmt"
	"vlt/internal/config"

	"github.com/gomodule/redigo/redis"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Client interface {
	Connect(ctx context.Context) error
	Close(ctx context.Context) error
	Query(ctx context.Context, graph string, query string) (string, error)
	Ping(ctx context.Context) bool
}

// --- FalkorDB Client ---

type FalkorClient struct {
	config config.FalkorConfig
	conn   redis.Conn
}

func NewFalkorClient(cfg config.FalkorConfig) *FalkorClient {
	return &FalkorClient{config: cfg}
}

func (c *FalkorClient) Connect(ctx context.Context) error {
	conn, err := redis.Dial("tcp", fmt.Sprintf("%s:%d", c.config.Host, c.config.Port))
	if err != nil {
		return err
	}
	c.conn = conn
	return nil
}

func (c *FalkorClient) Close(ctx context.Context) error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

func (c *FalkorClient) Query(ctx context.Context, graphName string, query string) (string, error) {
	if c.conn == nil {
		return "", fmt.Errorf("not connected")
	}

	// Remove --compact to get readable standard output
	result, err := c.conn.Do("GRAPH.QUERY", graphName, query)
	if err != nil {
		return "", err
	}

	// Simple formatter for Redis response
	return fmt.Sprintf("%v", result), nil
}

func (c *FalkorClient) Ping(ctx context.Context) bool {
	if c.conn == nil {
		return false
	}
	_, err := c.conn.Do("PING")
	return err == nil
}

// --- Neo4j/Memgraph Client ---

type NeoClient struct {
	config config.Neo4jConfig
	driver neo4j.DriverWithContext
}

func NewNeoClient(cfg config.Neo4jConfig) *NeoClient {
	return &NeoClient{config: cfg}
}

func (c *NeoClient) Connect(ctx context.Context) error {
	driver, err := neo4j.NewDriverWithContext(
		c.config.URI,
		neo4j.BasicAuth(c.config.Username, c.config.Password, ""),
	)
	if err != nil {
		return err
	}
	err = driver.VerifyConnectivity(ctx)
	if err != nil {
		return err
	}
	c.driver = driver
	return nil
}

func (c *NeoClient) Close(ctx context.Context) error {
	if c.driver != nil {
		return c.driver.Close(ctx)
	}
	return nil
}

func (c *NeoClient) Query(ctx context.Context, graph string, query string) (string, error) {
	if c.driver == nil {
		return "", fmt.Errorf("not connected")
	}

	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.Run(ctx, query, nil)
	if err != nil {
		return "", err
	}

	var records []string
	for result.Next(ctx) {
		records = append(records, fmt.Sprintf("%v", result.Record().AsMap()))
	}

	if len(records) == 0 {
		return "No records found.", result.Err()
	}

	return fmt.Sprintf("%v", records), result.Err()
}

func (c *NeoClient) Ping(ctx context.Context) bool {
	if c.driver == nil {
		return false
	}
	err := c.driver.VerifyConnectivity(ctx)
	return err == nil
}
