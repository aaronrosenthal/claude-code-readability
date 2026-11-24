---
description: Implement Money arithmetic and cent-preserving allocation in a small Rust ledger crate.
tags: [research, rust, domain-modeling]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

In `src/money.rs` of our `ledgerkit` crate, `Money` stores integer minor units plus a `Currency`, and `checked_add`, `checked_sub` and `allocate` are still `todo!()`. Please implement them so the tests in `tests/money.rs` pass:

- Adding or subtracting amounts in different currencies returns `MoneyError::CurrencyMismatch` (left is `self`, right is the argument). Integer overflow returns `MoneyError::Overflow`. Results can be negative.
- `allocate(&[u32])` splits an amount in proportion to the ratios, for example when we split an invoice between cost centres. The shares must add up to exactly the original amount: nothing lost to rounding, nothing created. Leftover cents go one at a time to the first shares. A ratio of zero never receives anything.
- `allocate` returns `NoRatios` for an empty slice and `ZeroRatioTotal` when every ratio is zero.
- No floating point anywhere, this is money.

When you're done, run `cargo test` and save its complete output to `test-results.txt`.
