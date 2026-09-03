package main

import "testing"

func TestUnrelatedAppEnvironmentDoesNotEnableProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DMMONITOR_ENV", "")

	if got := env("DMMONITOR_ENV", "development"); got != "development" {
		t.Fatalf("environment = %q, want development", got)
	}
}

func TestDmMonitorEnvironmentCanEnableProduction(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DMMONITOR_ENV", "production")

	if got := env("DMMONITOR_ENV", "development"); got != "production" {
		t.Fatalf("environment = %q, want production", got)
	}
}
