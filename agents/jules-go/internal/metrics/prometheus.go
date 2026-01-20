
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// SessionsTotal is a counter for the total number of sessions.
	SessionsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "jules_sessions_total",
			Help: "Total number of sessions.",
		},
		[]string{"status", "repo"},
	)

	// SessionDurationSeconds is a histogram for the duration of sessions.
	SessionDurationSeconds = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "jules_session_duration_seconds",
			Help:    "Duration of sessions in seconds.",
			Buckets: prometheus.LinearBuckets(30, 30, 10), // 10 buckets, 30s each
		},
	)

	// PRsMergedTotal is a counter for the total number of merged pull requests.
	PRsMergedTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "jules_prs_merged_total",
			Help: "Total number of merged pull requests.",
		},
	)

	// APIRequestDurationSeconds is a histogram for the duration of API requests.
	APIRequestDurationSeconds = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "jules_api_request_duration_seconds",
			Help:    "Duration of API requests in seconds.",
			Buckets: prometheus.DefBuckets,
		},
	)

	// SessionConcurrencyGauge is a gauge for the number of active sessions.
	SessionConcurrencyGauge = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "jules_sessions_active",
			Help: "Number of active sessions.",
		},
	)

	// SessionWaitingGauge is a gauge for the number of sessions waiting on the semaphore.
	SessionWaitingGauge = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "jules_sessions_waiting",
			Help: "Number of sessions waiting for the semaphore.",
		},
	)

	// SessionConcurrencyLimitGauge is a gauge for the concurrency limit.
	SessionConcurrencyLimitGauge = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "jules_sessions_concurrency_limit",
			Help: "Concurrency limit for sessions.",
		},
	)
)
