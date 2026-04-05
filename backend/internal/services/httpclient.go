package services

import (
	"net/http"
	"time"
)

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
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}
