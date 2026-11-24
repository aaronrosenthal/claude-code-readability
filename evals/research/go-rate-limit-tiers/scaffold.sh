#!/usr/bin/env bash
set -euo pipefail
mkdir -p ratelimit
cat > go.mod <<'EOF'
module example.com/apigateway

go 1.21
EOF
cat > ratelimit/types.go <<'EOF'
package ratelimit

import "time"

// Plan is the subscription tier an org pays for.
type Plan string

const (
	PlanFree       Plan = "free"
	PlanPro        Plan = "pro"
	PlanEnterprise Plan = "enterprise"
)

// Org is the account that owns an API key.
type Org struct {
	ID           string
	Plan         Plan
	Suspended    bool
	OverageOptIn bool
}

// Request is a single API call about to be admitted or rejected.
// Used counts the requests the org has already made this billing period.
type Request struct {
	Org  Org
	Used int
}

// MaintenanceWindow is a half-open interval [Start, End).
type MaintenanceWindow struct {
	Start time.Time
	End   time.Time
}

// Contains reports whether t falls inside the window.
func (w MaintenanceWindow) Contains(t time.Time) bool {
	return !t.Before(w.Start) && t.Before(w.End)
}

// Reason explains a Decision.
type Reason string

const (
	ReasonOK            Reason = "ok"
	ReasonBurst         Reason = "burst"
	ReasonOverage       Reason = "overage"
	ReasonSuspended     Reason = "suspended"
	ReasonMaintenance   Reason = "maintenance"
	ReasonQuotaExceeded Reason = "quota_exceeded"
)

// Decision is the outcome of admitting a request.
type Decision struct {
	Allowed  bool
	Reason   Reason
	Billable bool
}
EOF
cat > ratelimit/policy.go <<'EOF'
package ratelimit

import "time"

// Decide reports whether req may proceed at now, given the scheduled maintenance windows.
func Decide(req Request, now time.Time, windows []MaintenanceWindow) Decision {
	return Decision{}
}
EOF
cat > ratelimit/policy_test.go <<'EOF'
package ratelimit

import (
	"testing"
	"time"
)

var noon = time.Date(2025, 3, 10, 12, 0, 0, 0, time.UTC)

func org(plan Plan) Org {
	return Org{ID: "org-1", Plan: plan}
}

func TestDecideQuota(t *testing.T) {
	optIn := func(plan Plan) Org {
		o := org(plan)
		o.OverageOptIn = true
		return o
	}

	tests := []struct {
		name string
		org  Org
		used int
		want Decision
	}{
		{"free under quota", org(PlanFree), 999, Decision{Allowed: true, Reason: ReasonOK}},
		{"free at quota", org(PlanFree), 1000, Decision{Reason: ReasonQuotaExceeded}},
		{"free has no burst", org(PlanFree), 1050, Decision{Reason: ReasonQuotaExceeded}},
		{"free ignores overage opt-in", optIn(PlanFree), 5000, Decision{Reason: ReasonQuotaExceeded}},
		{"pro under quota", org(PlanPro), 49_999, Decision{Allowed: true, Reason: ReasonOK}},
		{"pro first burst request", org(PlanPro), 50_000, Decision{Allowed: true, Reason: ReasonBurst}},
		{"pro last burst request", org(PlanPro), 54_999, Decision{Allowed: true, Reason: ReasonBurst}},
		{"pro past burst without opt-in", org(PlanPro), 55_000, Decision{Reason: ReasonQuotaExceeded}},
		{"pro past burst with opt-in", optIn(PlanPro), 55_000, Decision{Allowed: true, Reason: ReasonOverage, Billable: true}},
		{"enterprise burst", org(PlanEnterprise), 1_000_000, Decision{Allowed: true, Reason: ReasonBurst}},
		{"enterprise past burst with opt-in", optIn(PlanEnterprise), 1_100_000, Decision{Allowed: true, Reason: ReasonOverage, Billable: true}},
		{"enterprise past burst without opt-in", org(PlanEnterprise), 1_100_000, Decision{Reason: ReasonQuotaExceeded}},
		{"unknown plan is denied", org(Plan("legacy")), 0, Decision{Reason: ReasonQuotaExceeded}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Decide(Request{Org: tt.org, Used: tt.used}, noon, nil)
			if got != tt.want {
				t.Errorf("Decide() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestDecideSuspended(t *testing.T) {
	window := MaintenanceWindow{Start: noon.Add(-time.Hour), End: noon.Add(time.Hour)}

	for _, plan := range []Plan{PlanFree, PlanPro, PlanEnterprise} {
		o := org(plan)
		o.Suspended = true

		got := Decide(Request{Org: o}, noon, []MaintenanceWindow{window})
		if got != (Decision{Reason: ReasonSuspended}) {
			t.Errorf("plan %s: Decide() = %+v, want suspended denial", plan, got)
		}
	}
}

func TestDecideMaintenance(t *testing.T) {
	windows := []MaintenanceWindow{
		{Start: noon.Add(-48 * time.Hour), End: noon.Add(-47 * time.Hour)},
		{Start: noon, End: noon.Add(time.Hour)},
	}

	tests := []struct {
		name string
		plan Plan
		now  time.Time
		want Decision
	}{
		{"free blocked at window start", PlanFree, noon, Decision{Reason: ReasonMaintenance}},
		{"pro blocked inside window", PlanPro, noon.Add(30 * time.Minute), Decision{Reason: ReasonMaintenance}},
		{"enterprise passes inside window", PlanEnterprise, noon.Add(30 * time.Minute), Decision{Allowed: true, Reason: ReasonOK}},
		{"free passes at window end", PlanFree, noon.Add(time.Hour), Decision{Allowed: true, Reason: ReasonOK}},
		{"free passes before window", PlanFree, noon.Add(-time.Second), Decision{Allowed: true, Reason: ReasonOK}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Decide(Request{Org: org(tt.plan)}, tt.now, windows)
			if got != tt.want {
				t.Errorf("Decide() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestDecideMaintenanceDoesNotBypassQuota(t *testing.T) {
	window := MaintenanceWindow{Start: noon, End: noon.Add(time.Hour)}

	got := Decide(Request{Org: org(PlanEnterprise), Used: 2_000_000}, noon, []MaintenanceWindow{window})
	if got != (Decision{Reason: ReasonQuotaExceeded}) {
		t.Errorf("Decide() = %+v, want quota denial", got)
	}
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
