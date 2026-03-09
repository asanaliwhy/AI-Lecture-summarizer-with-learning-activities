package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

type visitor struct {
	count    int
	lastSeen time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	limit    int
	window   time.Duration

	trustedProxies []netip.Prefix
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return NewRateLimiterWithTrustedProxies(limit, window, nil)
}

func NewRateLimiterWithTrustedProxies(limit int, window time.Duration, trustedProxyCIDRs []string) *RateLimiter {
	trusted := make([]netip.Prefix, 0, len(trustedProxyCIDRs))
	for _, cidr := range trustedProxyCIDRs {
		prefix, err := netip.ParsePrefix(strings.TrimSpace(cidr))
		if err != nil {
			continue
		}
		trusted = append(trusted, prefix)
	}

	rl := &RateLimiter{
		visitors:       make(map[string]*visitor),
		limit:          limit,
		window:         window,
		trustedProxies: trusted,
	}

	// Cleanup goroutine
	go func() {
		for {
			time.Sleep(window)
			rl.mu.Lock()
			for ip, v := range rl.visitors {
				if time.Since(v.lastSeen) > window {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()

	return rl
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := realIP(r, rl.trustedProxies)

		rl.mu.Lock()
		v, exists := rl.visitors[ip]
		if !exists {
			rl.visitors[ip] = &visitor{count: 1, lastSeen: time.Now()}
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		if time.Since(v.lastSeen) > rl.window {
			v.count = 1
			v.lastSeen = time.Now()
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		v.count++
		v.lastSeen = time.Now()
		count := v.count
		rl.mu.Unlock()

		if count > rl.limit {
			writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests. Please try again later.", r)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func realIP(r *http.Request, trustedProxies []netip.Prefix) string {
	remote := remoteHost(r.RemoteAddr)
	if !isTrustedProxy(remote, trustedProxies) {
		return remote
	}

	if ip := normalizeIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); ip != "" {
		return ip
	}

	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		for _, p := range parts {
			if ip := normalizeIP(strings.TrimSpace(p)); ip != "" {
				return ip
			}
		}
	}

	return remote
}

func remoteHost(remoteAddr string) string {
	ip, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return normalizeIP(remoteAddr)
	}
	return normalizeIP(ip)
}

func normalizeIP(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = strings.TrimPrefix(strings.TrimSuffix(value, "]"), "[")
	if addr, err := netip.ParseAddr(value); err == nil {
		return addr.String()
	}
	return ""
}

func isTrustedProxy(remoteIP string, trustedProxies []netip.Prefix) bool {
	if len(trustedProxies) == 0 {
		return false
	}

	addr, err := netip.ParseAddr(remoteIP)
	if err != nil {
		return false
	}

	for _, prefix := range trustedProxies {
		if prefix.Contains(addr) {
			return true
		}
	}

	return false
}
