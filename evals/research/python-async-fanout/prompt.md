---
description: Implement an asyncio fan-out across inventory services with timeouts and partial failures.
tags: [research, python, async-orchestration]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Product pages need to show stock for a SKU across all our inventory services. `stockcheck/aggregate.py` has a stub for `async check_stock(sku, services, timeout)`; see the README for what a service looks like.

- Query all services at the same time, not one after another.
- `timeout` is per service call. A service that is too slow or raises must not break the others: record it in `report.failures[service.name]` as `"timeout"` or `"<ExceptionType>: <message>"` and carry on.
- Merge the `{location: quantity}` results into `report.levels`. When several services report the same location, the one with the lowest `priority` number wins; for equal priorities the earlier service in the list wins. Failed services contribute nothing.

The tests (using fake services) are in `tests/test_aggregate.py`.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
