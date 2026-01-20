package metrics

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
)

func TestMetricsRegistered(t *testing.T) {
	// Verify all metrics are properly registered by checking they are not nil
	tests := []struct {
		name   string
		metric prometheus.Collector
	}{
		{"SessionsTotal", SessionsTotal},
		{"SessionDurationSeconds", SessionDurationSeconds},
		{"PRsMergedTotal", PRsMergedTotal},
		{"APIRequestDurationSeconds", APIRequestDurationSeconds},
		{"SessionConcurrencyGauge", SessionConcurrencyGauge},
		{"SessionWaitingGauge", SessionWaitingGauge},
		{"SessionConcurrencyLimitGauge", SessionConcurrencyLimitGauge},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.metric == nil {
				t.Errorf("expected %s to be registered, got nil", tt.name)
			}
		})
	}
}

func TestSessionsTotalIncrement(t *testing.T) {
	// Test that we can increment the counter without panicking
	SessionsTotal.WithLabelValues("completed", "test-repo").Inc()
	SessionsTotal.WithLabelValues("failed", "test-repo").Inc()
}

func TestSessionDurationObserve(t *testing.T) {
	// Test that we can observe duration without panicking
	SessionDurationSeconds.Observe(60.0)
	SessionDurationSeconds.Observe(120.5)
}

func TestGaugeSetOperations(t *testing.T) {
	// Test gauge operations
	SessionConcurrencyGauge.Set(5)
	SessionConcurrencyGauge.Inc()
	SessionConcurrencyGauge.Dec()

	SessionWaitingGauge.Set(0)
	SessionConcurrencyLimitGauge.Set(15)
}

func TestAPIRequestDurationObserve(t *testing.T) {
	APIRequestDurationSeconds.Observe(0.5)
	APIRequestDurationSeconds.Observe(1.2)
}

func TestPRsMergedIncrement(t *testing.T) {
	PRsMergedTotal.Inc()
	PRsMergedTotal.Add(5)
}
