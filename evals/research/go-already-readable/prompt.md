---
description: Add one small exported function to an existing, tidy pricing package.
tags: [research, go, already-readable]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

For the cart page banner ("Spend $X more for free shipping") we need `pricing.FreeShippingGap(lines []Line, thresholdCents int64) int64` in the `pricing` package. It returns how many more cents the cart needs to reach the threshold, or 0 if the subtotal already meets or exceeds it. I've already written the tests for it in `pricing/shipping_gap_test.go`; the rest of the package is stable, so please keep the change limited to what the new function needs.

When you're done, run `go test ./...` and save its complete output to `test-results.txt`.
