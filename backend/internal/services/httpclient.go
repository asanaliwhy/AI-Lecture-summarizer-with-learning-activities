package services

import (
	"net/url"
	"net/http"
	"os"
	"time"
)

func transportWithOptionalProxy(base *http.Transport) *http.Transport {
	t := base.Clone()

	proxyURL := os.Getenv("YT_PROXY_URL")
	if proxyURL == "" {
		return t
	}

	parsed, err := url.Parse(proxyURL)
	if err != nil {
		return t
	}

	t.Proxy = http.ProxyURL(parsed)
	return t
}

// DefaultHTTPClient is a shared client with sensible timeouts for outbound calls.
var DefaultHTTPClient = &http.Client{
	Timeout: 15 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// YouTubeHTTPClient uses a shorter timeout for lightweight URL validation calls.
var YouTubeHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: transportWithOptionalProxy(&http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	}),
}
