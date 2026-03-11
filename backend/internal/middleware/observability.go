package middleware

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

func (sr *statusRecorder) Write(b []byte) (int, error) {
	n, err := sr.ResponseWriter.Write(b)
	sr.bytes += n
	return n, err
}

// Hijack implements http.Hijacker so that WebSocket upgrades work through this middleware.
func (sr *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := sr.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, fmt.Errorf("underlying ResponseWriter does not support hijacking")
}

// Flush implements http.Flusher for streaming responses.
func (sr *statusRecorder) Flush() {
	if fl, ok := sr.ResponseWriter.(http.Flusher); ok {
		fl.Flush()
	}
}

type metricsCollector struct {
	startedAt time.Time

	totalRequests   atomic.Uint64
	totalDurationNS atomic.Uint64

	mu           sync.RWMutex
	statusCounts map[int]uint64
}

func newMetricsCollector() *metricsCollector {
	return &metricsCollector{
		startedAt:    time.Now(),
		statusCounts: make(map[int]uint64),
	}
}

func (m *metricsCollector) observe(status int, duration time.Duration) {
	m.totalRequests.Add(1)
	m.totalDurationNS.Add(uint64(duration.Nanoseconds()))

	m.mu.Lock()
	m.statusCounts[status]++
	m.mu.Unlock()
}

func (m *metricsCollector) snapshotStatusCounts() [][2]uint64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	rows := make([][2]uint64, 0, len(m.statusCounts))
	for status, count := range m.statusCounts {
		rows = append(rows, [2]uint64{uint64(status), count})
	}

	sort.Slice(rows, func(i, j int) bool {
		return rows[i][0] < rows[j][0]
	})

	return rows
}

var defaultMetricsCollector = newMetricsCollector()

// StructuredRequestLog logs one structured JSON line per request and records request metrics.
func StructuredRequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(recorder, r)

		duration := time.Since(started)
		defaultMetricsCollector.observe(recorder.status, duration)

		entry := map[string]interface{}{
			"ts":          time.Now().UTC().Format(time.RFC3339Nano),
			"level":       "info",
			"msg":         "http_request",
			"request_id":  r.Header.Get("X-Request-ID"),
			"method":      r.Method,
			"path":        r.URL.Path,
			"status":      recorder.status,
			"duration_ms": duration.Milliseconds(),
			"bytes":       recorder.bytes,
			"remote_addr": r.RemoteAddr,
			"user_agent":  r.UserAgent(),
		}

		encoded, err := json.Marshal(entry)
		if err != nil {
			log.Printf("{\"level\":\"error\",\"msg\":\"structured_log_marshal_failed\",\"error\":%q}", err.Error())
			return
		}

		log.Println(string(encoded))
	})
}

// MetricsHandler exposes minimal process/request metrics in Prometheus text format.
func MetricsHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")

	total := defaultMetricsCollector.totalRequests.Load()
	totalDurationNS := defaultMetricsCollector.totalDurationNS.Load()
	uptimeSeconds := time.Since(defaultMetricsCollector.startedAt).Seconds()

	avgLatencyMS := 0.0
	if total > 0 {
		avgLatencyMS = float64(totalDurationNS) / float64(total) / 1_000_000
	}

	_, _ = fmt.Fprintln(w, "# HELP lectura_requests_total Total number of HTTP requests served")
	_, _ = fmt.Fprintln(w, "# TYPE lectura_requests_total counter")
	_, _ = fmt.Fprintf(w, "lectura_requests_total %d\n", total)

	_, _ = fmt.Fprintln(w, "# HELP lectura_request_latency_ms_avg Average HTTP request latency in milliseconds")
	_, _ = fmt.Fprintln(w, "# TYPE lectura_request_latency_ms_avg gauge")
	_, _ = fmt.Fprintf(w, "lectura_request_latency_ms_avg %.2f\n", avgLatencyMS)

	_, _ = fmt.Fprintln(w, "# HELP lectura_process_uptime_seconds Process uptime in seconds")
	_, _ = fmt.Fprintln(w, "# TYPE lectura_process_uptime_seconds gauge")
	_, _ = fmt.Fprintf(w, "lectura_process_uptime_seconds %.0f\n", uptimeSeconds)

	_, _ = fmt.Fprintln(w, "# HELP lectura_requests_by_status HTTP requests grouped by status code")
	_, _ = fmt.Fprintln(w, "# TYPE lectura_requests_by_status counter")
	for _, row := range defaultMetricsCollector.snapshotStatusCounts() {
		_, _ = fmt.Fprintf(w, "lectura_requests_by_status{code=\"%d\"} %d\n", row[0], row[1])
	}
}
