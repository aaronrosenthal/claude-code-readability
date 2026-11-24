---
description: Implement the request admission decision for a tiered API rate limiter with nested business rules.
tags: [research, go, nested-conditionals]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We're replacing the ad-hoc quota checks in our API gateway with one function, and `ratelimit.Decide` in `ratelimit/policy.go` is currently a stub. It takes a `Request` (the org plus how many requests it has already made this billing period), the current time, and the list of scheduled maintenance windows, and returns a `Decision` with `Allowed`, a `Reason`, and `Billable`. The types and `Reason` constants are in `ratelimit/types.go`; the tests in `ratelimit/policy_test.go` show the expected behavior.

Rules, in order of precedence:

- Suspended orgs are always denied (`ReasonSuspended`), even on the enterprise plan.
- During a maintenance window only enterprise orgs are let through; everyone else is denied with `ReasonMaintenance`. Windows include their start and exclude their end.
- Otherwise the plan's period quota applies: free 1,000, pro 50,000, enterprise 1,000,000 requests. Below the quota the request is allowed (`ReasonOK`).
- Pro and enterprise orgs get a burst allowance of 10% of their quota. Requests in that band are allowed with `ReasonBurst`.
- Past quota plus burst, a pro or enterprise org that has opted into overage billing is allowed with `ReasonOverage` and `Billable: true`. Free orgs can't use overage even if the flag is set.
- Anything else past the limit is denied with `ReasonQuotaExceeded`.

When you're done, run `go test ./...` and save its complete output to `test-results.txt`.
