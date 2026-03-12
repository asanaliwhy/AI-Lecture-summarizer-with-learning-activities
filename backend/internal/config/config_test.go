package config

import (
	"os"
	"testing"
)

func TestGetEnvOrDefault(t *testing.T) {
	tests := []struct {
		name       string
		key        string
		envValue   string
		defaultVal string
		expected   string
	}{
		{"uses env value", "TEST_VAR_1", "hello", "default", "hello"},
		{"uses default when empty", "TEST_VAR_2", "", "default", "default"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.envValue != "" {
				os.Setenv(tc.key, tc.envValue)
				defer os.Unsetenv(tc.key)
			}

			result := getEnvOrDefault(tc.key, tc.defaultVal)
			if result != tc.expected {
				t.Errorf("Expected %q, got %q", tc.expected, result)
			}
		})
	}
}

func TestGetEnvAsIntOrDefault(t *testing.T) {
	tests := []struct {
		name       string
		key        string
		envValue   string
		defaultVal int
		expected   int
	}{
		{"parses integer", "TEST_INT_1", "42", 10, 42},
		{"uses default for empty", "TEST_INT_2", "", 10, 10},
		{"uses default for non-numeric", "TEST_INT_3", "abc", 10, 10},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.envValue != "" {
				os.Setenv(tc.key, tc.envValue)
				defer os.Unsetenv(tc.key)
			}

			result := getEnvAsIntOrDefault(tc.key, tc.defaultVal)
			if result != tc.expected {
				t.Errorf("Expected %d, got %d", tc.expected, result)
			}
		})
	}
}

func TestMustGetEnv_ReturnsValue(t *testing.T) {
	t.Setenv("TEST_VAR", "hello")

	result := mustGetEnv("TEST_VAR")
	if result != "hello" {
		t.Errorf("Expected 'hello', got %q", result)
	}
}

func TestGetEnvAsCSV(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		envValue string
		expected []string
	}{
		{name: "empty returns nil", key: "TEST_CSV_1", envValue: "", expected: nil},
		{name: "single value", key: "TEST_CSV_2", envValue: "10.0.0.0/8", expected: []string{"10.0.0.0/8"}},
		{name: "multiple with spaces", key: "TEST_CSV_3", envValue: "10.0.0.0/8, 172.16.0.0/12 ,192.168.0.0/16", expected: []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.envValue == "" {
				os.Unsetenv(tc.key)
			} else {
				os.Setenv(tc.key, tc.envValue)
				defer os.Unsetenv(tc.key)
			}

			result := getEnvAsCSV(tc.key)
			if len(result) != len(tc.expected) {
				t.Fatalf("expected %d values, got %d", len(tc.expected), len(result))
			}
			for i := range result {
				if result[i] != tc.expected[i] {
					t.Fatalf("expected %q at index %d, got %q", tc.expected[i], i, result[i])
				}
			}
		})
	}
}
