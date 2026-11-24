---
description: Build a parameterized, injection-safe SQL query from an order search filter.
tags: [research, go, database-queries]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

The order search endpoint currently builds its SQL with string concatenation in the handler, which our security review flagged. I want that moved into `orders.BuildOrderQuery` in `orders/query.go`, which is a stub right now. It takes the `OrderFilter` from `orders/filter.go` and returns the SQL, its arguments for the Postgres driver (`$1`, `$2`, ...), and an error.

- Select `id, customer_id, status, total_cents, created_at` from `orders`.
- Every non-empty filter field adds an `AND`ed condition, in this order: `CustomerID` (equality), `Status` (an `IN` list with one placeholder per status), `Search` (`customer_email ILIKE`, matching anywhere in the address, with `%`, `_` and `\` in the user's text escaped so they match literally), `MinTotalCents` / `MaxTotalCents` (`total_cents >=` / `<=`), `CreatedAfter` (`created_at >=`) and `CreatedBefore` (`created_at <`). Zero values mean "not set".
- Never put user input in the SQL text. Sorting is by `SortBy`, which must be one of `created_at`, `total_cents` or `status`; anything else returns `ErrInvalidSort`. With no `SortBy` the order is `created_at DESC`. Ties are always broken by `id ASC`.
- `Limit` defaults to 50 and is capped at 200. Negative `Limit` or `Offset` returns `ErrInvalidPagination`. `LIMIT` and `OFFSET` are always parameters.

`orders/query_test.go` has the exact SQL text and arguments expected.

When you're done, run `go test ./...` and save its complete output to `test-results.txt`.
