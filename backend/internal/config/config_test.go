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

func TestMustGetEnv_Panics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("Expected panic for missing required env var")
		}
	}()

	os.Unsetenv("NONEXISTENT_REQUIRED_VAR")
	mustGetEnv("NONEXISTENT_REQUIRED_VAR")
}

func TestMustGetEnv_ReturnsValue(t *testing.T) {
	os.Setenv("TEST_REQUIRED", "value123")
	defer os.Unsetenv("TEST_REQUIRED")

	result := mustGetEnv("TEST_REQUIRED")
	if result != "value123" {
		t.Errorf("Expected 'value123', got %q", result)
	}
}
