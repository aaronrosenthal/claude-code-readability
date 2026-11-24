---
description: Add a class with public methods to a Ruby app whose RuboCop config is inherited from a shared base file.
tags: [research, ruby, inherited-lint-config, new-class]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We're adding tiers to the loyalty program. Please add `LoyaltyMember` in `app/services/loyalty_member.rb`; the tests are already in `test/services/loyalty_member_test.rb`.

It is built with `LoyaltyMember.new(lifetime_points:)` (negative points raise `ArgumentError`) and has three public methods:

- `tier` returns `:bronze`, `:silver`, `:gold` or `:platinum`, using the thresholds in `TierThresholds` (below the silver threshold is bronze).
- `points_to_next_tier` returns how many more lifetime points are needed to reach the next tier, or `nil` for platinum members.
- `perks` returns the perks the member has unlocked, lowest tier first: silver gives `"free_shipping"`, gold adds `"early_access"`, platinum adds `"concierge"`. Higher tiers keep the lower tiers' perks.

CI runs `bundle exec rubocop`, so it needs to pass with the repo's config.

When you're done, run `ruby -Itest -e 'Dir["test/**/*_test.rb"].each { |f| require File.expand_path(f) }'` and save its complete output to `test-results.txt`.
