package jules

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"

	"jules-go/internal/logging"
)

// Sentinel errors for retry logic
var (
	ErrMaxRetriesExceeded = errors.New("maximum retries exceeded")
	ErrNonRetriable       = errors.New("non-retriable error")
	ErrBudgetExhausted    = errors.New("retry budget exhausted")
)

// RetryBudget implements a token bucket for controlling retry rate.
// Prevents "thundering herd" issues when many retries fail simultaneously.
type RetryBudget struct {
	tokens     int
	maxTokens  int
	refillRate time.Duration
	lastRefill time.Time
	mu         sync.Mutex
}

// NewRetryBudget creates a new retry budget with the given capacity.
func NewRetryBudget(maxTokens int, refillRate time.Duration) *RetryBudget {
	return &RetryBudget{
		tokens:     maxTokens,
		maxTokens:  maxTokens,
		refillRate: refillRate,
		lastRefill: time.Now(),
	}
}

// DefaultRetryBudget returns a budget with sensible defaults.
func DefaultRetryBudget() *RetryBudget {
	return NewRetryBudget(10, time.Minute)
}

// Consume attempts to consume a token. Returns true if successful.
func (rb *RetryBudget) Consume() bool {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	rb.refill()

	if rb.tokens <= 0 {
		return false // Budget exhausted
	}
	rb.tokens--
	return true
}

// Available returns the current number of available tokens.
func (rb *RetryBudget) Available() int {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.refill()
	return rb.tokens
}

// refill adds tokens based on elapsed time (must hold lock).
func (rb *RetryBudget) refill() {
	now := time.Now()
	elapsed := now.Sub(rb.lastRefill)
	tokensToAdd := int(elapsed / rb.refillRate)

	if tokensToAdd > 0 {
		rb.tokens += tokensToAdd
		if rb.tokens > rb.maxTokens {
			rb.tokens = rb.maxTokens
		}
		rb.lastRefill = now
	}
}

// RetryPolicy configures retry behavior with exponential backoff.
type RetryPolicy struct {
	MaxRetries   int           // Maximum number of retry attempts (default: 3)
	BackoffBase  time.Duration // Base delay for exponential backoff (default: 1s)
	BackoffMax   time.Duration // Maximum delay cap (default: 30s)
	Jitter       float64       // Jitter factor 0-1 for randomization (default: 0.2)
	NonRetriable []string      // Error substrings that should not be retried
}

// DefaultRetryPolicy returns sensible defaults for retry behavior.
func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxRetries:  3,
		BackoffBase: 1 * time.Second,
		BackoffMax:  30 * time.Second,
		Jitter:      0.2,
		NonRetriable: []string{
			"auth_failed",
			"permission_denied",
			"invalid_api_key",
			"not_found",
		},
	}
}

// RetryResult contains the outcome of a retry operation.
type RetryResult struct {
	Success  bool
	Attempts int
	LastErr  error
	Duration time.Duration
}

// isNonRetriable checks if an error matches any non-retriable patterns.
func (p *RetryPolicy) isNonRetriable(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	for _, pattern := range p.NonRetriable {
		if strings.Contains(errStr, strings.ToLower(pattern)) {
			return true
		}
	}
	return false
}

// calculateBackoff returns the delay for a given attempt with jitter.
func (p *RetryPolicy) calculateBackoff(attempt int) time.Duration {
	// Exponential: base * 2^attempt
	delay := float64(p.BackoffBase) * math.Pow(2, float64(attempt))

	// Apply cap
	if delay > float64(p.BackoffMax) {
		delay = float64(p.BackoffMax)
	}

	// Apply jitter: delay * (1 ± jitter)
	jitterRange := delay * p.Jitter
	jitter := (rand.Float64()*2 - 1) * jitterRange // -jitter to +jitter
	delay += jitter

	return time.Duration(delay)
}

// RetrySession sends a retry command to a failed session with exponential backoff.
func (c *Client) RetrySession(ctx context.Context, sessionID string) (*RetryResult, error) {
	return c.RetrySessionWithPolicy(ctx, sessionID, DefaultRetryPolicy())
}

// RetrySessionWithPolicy sends a retry command with a custom retry policy.
func (c *Client) RetrySessionWithPolicy(ctx context.Context, sessionID string, policy RetryPolicy) (*RetryResult, error) {
	logger := logging.FromContext(ctx).With(
		"component", "retry",
		"session_id", sessionID,
		"max_retries", policy.MaxRetries,
	)

	startTime := time.Now()
	result := &RetryResult{}

	for attempt := 0; attempt <= policy.MaxRetries; attempt++ {
		result.Attempts = attempt + 1
		logger := logger.With("attempt", attempt+1)

		if attempt > 0 {
			backoff := policy.calculateBackoff(attempt - 1)
			logger.Info("backing off before retry", "delay", backoff)

			select {
			case <-ctx.Done():
				result.LastErr = ctx.Err()
				result.Duration = time.Since(startTime)
				return result, ctx.Err()
			case <-time.After(backoff):
			}
		}

		logger.Info("attempting session retry")
		err := c.sendRetryCommand(ctx, sessionID)

		if err == nil {
			result.Success = true
			result.Duration = time.Since(startTime)
			logger.Info("retry successful", "total_duration", result.Duration)
			return result, nil
		}

		result.LastErr = err

		// Check for non-retriable errors
		if policy.isNonRetriable(err) {
			logger.Warn("non-retriable error encountered", "err", err)
			result.Duration = time.Since(startTime)
			return result, fmt.Errorf("%w: %v", ErrNonRetriable, err)
		}

		logger.Warn("retry attempt failed", "err", err)
	}

	result.Duration = time.Since(startTime)
	logger.Error("max retries exceeded", "total_attempts", result.Attempts, "last_err", result.LastErr)
	return result, fmt.Errorf("%w after %d attempts: %v", ErrMaxRetriesExceeded, result.Attempts, result.LastErr)
}

// sendRetryCommand sends a retry command to a session.
func (c *Client) sendRetryCommand(ctx context.Context, sessionID string) error {
	url := fmt.Sprintf("%s/sessions/%s:retry", c.baseURL, sessionID)
	req, err := c.newRequest(ctx, "POST", url, nil)
	if err != nil {
		return err
	}

	_, err = c.do(req, nil)
	return err
}

// RetryMultipleSessions retries multiple failed sessions in parallel.
func (c *Client) RetryMultipleSessions(ctx context.Context, sessionIDs []string, policy RetryPolicy) map[string]*RetryResult {
	results := make(map[string]*RetryResult)
	resultChan := make(chan struct {
		id     string
		result *RetryResult
		err    error
	}, len(sessionIDs))

	// Launch retries in parallel
	for _, id := range sessionIDs {
		go func(sessionID string) {
			result, err := c.RetrySessionWithPolicy(ctx, sessionID, policy)
			if result == nil {
				result = &RetryResult{LastErr: err}
			}
			resultChan <- struct {
				id     string
				result *RetryResult
				err    error
			}{sessionID, result, err}
		}(id)
	}

	// Collect results
	for range sessionIDs {
		r := <-resultChan
		results[r.id] = r.result
	}

	return results
}
