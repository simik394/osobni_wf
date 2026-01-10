package db

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	GraphName = "jules"
)

// JulesSession represents a session node in FalkorDB.
type JulesSession struct {
	ID        string    `redis:"id"`
	Status    string    `redis:"status"`
	Repo      string    `redis:"repo"`
	Task      string    `redis:"task"`
	CreatedAt time.Time `redis:"created_at"`
	UpdatedAt time.Time `redis:"updated_at"`
}

// Client is a FalkorDB client.
type Client struct {
	rdb *redis.Client
}

// NewClient creates a new FalkorDB client.
func NewClient(ctx context.Context, addr string) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return &Client{rdb: rdb}, nil
}

// Close closes the connection to the database.
func (c *Client) Close() error {
	return c.rdb.Close()
}

// buildParameterizedQuery safely constructs a parameterized Cypher query.
func buildParameterizedQuery(query string, params map[string]interface{}) (string, error) {
	if len(params) == 0 {
		return query, nil
	}

	var cypherParams []string
	for key, value := range params {
		var formattedValue string
		switch v := value.(type) {
		case string:
			// Use strconv.Quote for robust, standard-compliant string escaping.
			formattedValue = strconv.Quote(v)
		case int, int64, int32, int16, int8:
			formattedValue = fmt.Sprintf("%d", v)
		case float64, float32:
			formattedValue = fmt.Sprintf("%f", v)
		case bool:
			formattedValue = fmt.Sprintf("%t", v)
		default:
			return "", fmt.Errorf("unsupported parameter type for key %s: %T", key, value)
		}
		cypherParams = append(cypherParams, fmt.Sprintf("%s=%s", key, formattedValue))
	}

	return fmt.Sprintf("CYPHER %s %s", strings.Join(cypherParams, " "), query), nil
}

// CreateJulesSession creates a new JulesSession node.
func (c *Client) CreateJulesSession(ctx context.Context, session *JulesSession) error {
	query := `
		CREATE (s:JulesSession {
			id: $id,
			status: $status,
			repo: $repo,
			task: $task,
			created_at: $created_at,
			updated_at: $updated_at
		})
	`
	params := map[string]interface{}{
		"id":         session.ID,
		"status":     session.Status,
		"repo":       session.Repo,
		"task":       session.Task,
		"created_at": session.CreatedAt.Unix(),
		"updated_at": session.UpdatedAt.Unix(),
	}

	parameterizedQuery, err := buildParameterizedQuery(query, params)
	if err != nil {
		return err
	}

	_, err = c.rdb.Do(ctx, "GRAPH.QUERY", GraphName, parameterizedQuery).Result()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	return nil
}

// GetJulesSession retrieves a JulesSession node by its ID.
func (c *Client) GetJulesSession(ctx context.Context, id string) (*JulesSession, error) {
	query := `
		MATCH (s:JulesSession {id: $id})
		RETURN s.id, s.status, s.repo, s.task, s.created_at, s.updated_at
	`
	params := map[string]interface{}{
		"id": id,
	}

	parameterizedQuery, err := buildParameterizedQuery(query, params)
	if err != nil {
		return nil, err
	}

	res, err := c.rdb.Do(ctx, "GRAPH.QUERY", GraphName, parameterizedQuery).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	results, ok := res.([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid response format: expected top-level array")
	}
	if len(results) < 2 {
		return nil, fmt.Errorf("invalid response format: expected at least 2 elements in response")
	}

	// Parse header to create a column name to index map
	header, ok := results[0].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid response format: header is not an array")
	}
	colIndex := make(map[string]int)
	for i, col := range header {
		colName, ok := col.(string)
		if !ok {
			return nil, fmt.Errorf("invalid response format: column name is not a string")
		}
		colIndex[colName] = i
	}

	// Check for required columns
	requiredCols := []string{"s.id", "s.status", "s.repo", "s.task", "s.created_at", "s.updated_at"}
	for _, col := range requiredCols {
		if _, exists := colIndex[col]; !exists {
			return nil, fmt.Errorf("missing required column in response: %s", col)
		}
	}

	// Parse data rows
	data, ok := results[1].([]interface{})
	if !ok || len(data) == 0 {
		return nil, nil // Not found
	}

	row, ok := data[0].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid row format: not an array")
	}

	// Safely extract values using the column index map
	sessionID, ok := row[colIndex["s.id"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid id format")
	}
	status, ok := row[colIndex["s.status"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid status format")
	}
	repo, ok := row[colIndex["s.repo"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid repo format")
	}
	task, ok := row[colIndex["s.task"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task format")
	}
	createdAtUnix, ok := row[colIndex["s.created_at"]].(int64)
	if !ok {
		return nil, fmt.Errorf("invalid created_at format")
	}
	updatedAtUnix, ok := row[colIndex["s.updated_at"]].(int64)
	if !ok {
		return nil, fmt.Errorf("invalid updated_at format")
	}

	session := &JulesSession{
		ID:        sessionID,
		Status:    status,
		Repo:      repo,
		Task:      task,
		CreatedAt: time.Unix(createdAtUnix, 0),
		UpdatedAt: time.Unix(updatedAtUnix, 0),
	}

	return session, nil
}

// UpdateJulesSession updates an existing JulesSession node.
func (c *Client) UpdateJulesSession(ctx context.Context, session *JulesSession) error {
	query := `
		MATCH (s:JulesSession {id: $id})
		SET s.status = $status, s.repo = $repo, s.task = $task, s.updated_at = $updated_at
	`
	params := map[string]interface{}{
		"id":         session.ID,
		"status":     session.Status,
		"repo":       session.Repo,
		"task":       session.Task,
		"updated_at": session.UpdatedAt.Unix(),
	}

	parameterizedQuery, err := buildParameterizedQuery(query, params)
	if err != nil {
		return err
	}

	_, err = c.rdb.Do(ctx, "GRAPH.QUERY", GraphName, parameterizedQuery).Result()
	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}
	return nil
}

// DeleteJulesSession deletes a JulesSession node by its ID.
func (c *Client) DeleteJulesSession(ctx context.Context, id string) error {
	query := `
		MATCH (s:JulesSession {id: $id})
		DELETE s
	`
	params := map[string]interface{}{
		"id": id,
	}

	parameterizedQuery, err := buildParameterizedQuery(query, params)
	if err != nil {
		return err
	}

	_, err = c.rdb.Do(ctx, "GRAPH.QUERY", GraphName, parameterizedQuery).Result()
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}
