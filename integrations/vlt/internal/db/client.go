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
	Query(ctx context.Context, graph string, query string) ([]map[string]interface{}, error)
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

func (c *FalkorClient) Query(ctx context.Context, graphName string, query string) ([]map[string]interface{}, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("not connected")
	}

	// Direct REDISGRAPH query to avoid dependency issues with falkordb-go/tablewriter
	// result, err := c.conn.Do("GRAPH.QUERY", graphName, query, "--compact")
	// For now we just run it and return empty to satisfy the interface and confirm connectivity.
	// Parsing compact headers/rows manually is tedious but safe.

	_, err := c.conn.Do("GRAPH.QUERY", graphName, query, "--compact")
	if err != nil {
		return nil, err
	}

	records := make([]map[string]interface{}, 0)
	return records, nil
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

func (c *NeoClient) Query(ctx context.Context, graph string, query string) ([]map[string]interface{}, error) {
	if c.driver == nil {
		return nil, fmt.Errorf("not connected")
	}

	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.Run(ctx, query, nil)
	if err != nil {
		return nil, err
	}

	var records []map[string]interface{}
	for result.Next(ctx) {
		records = append(records, result.Record().AsMap())
	}

	return records, result.Err()
}

func (c *NeoClient) Ping(ctx context.Context) bool {
	if c.driver == nil {
		return false
	}
	err := c.driver.VerifyConnectivity(ctx)
	return err == nil
}
