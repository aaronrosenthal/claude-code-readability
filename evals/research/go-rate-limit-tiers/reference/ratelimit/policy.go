package ratelimit

import "time"

type quota struct {
	limit        int
	burstPercent int
}

var quotas = map[Plan]quota{
	PlanFree:       {limit: 1_000},
	PlanPro:        {limit: 50_000, burstPercent: 10},
	PlanEnterprise: {limit: 1_000_000, burstPercent: 10},
}

// Decide reports whether req may proceed at now, given the scheduled maintenance windows.
func Decide(req Request, now time.Time, windows []MaintenanceWindow) Decision {
	if req.Org.Suspended {
		return deny(ReasonSuspended)
	}
	if req.Org.Plan != PlanEnterprise && inMaintenance(now, windows) {
		return deny(ReasonMaintenance)
	}
	return decideQuota(req)
}

func decideQuota(req Request) Decision {
	q := quotas[req.Org.Plan]
	burstLimit := q.limit + q.limit*q.burstPercent/100

	switch {
	case req.Used < q.limit:
		return Decision{Allowed: true, Reason: ReasonOK}
	case req.Used < burstLimit:
		return Decision{Allowed: true, Reason: ReasonBurst}
	case req.Org.OverageOptIn && req.Org.Plan != PlanFree:
		return Decision{Allowed: true, Reason: ReasonOverage, Billable: true}
	default:
		return deny(ReasonQuotaExceeded)
	}
}

func inMaintenance(now time.Time, windows []MaintenanceWindow) bool {
	for _, w := range windows {
		if w.Contains(now) {
			return true
		}
	}
	return false
}

func deny(reason Reason) Decision {
	return Decision{Reason: reason}
}
