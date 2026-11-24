---
description: Add two service classes to a Rails-style Ruby app whose RuboCop config requires class documentation.
tags: [research, ruby, lint-documentation, new-class]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Please add two service classes under `app/services/`, following the existing ones there. Tests are already written in `test/services/`.

- `OrderCanceller` (`order_canceller.rb`): `OrderCanceller.new(order).call` cancels an order that is `:pending` or `:paid` and returns a result with `cancelled`, `refund_cents` and `reason`. Paid orders get the full order total back, pending orders get nothing since they were never charged. Shipped, delivered and already-cancelled orders are left alone and rejected with the reasons the tests expect.
- `DeliveryEstimator` (`delivery_estimator.rb`): `DeliveryEstimator.new(order).estimated_on` returns the delivery date, counted in business days (Monday to Friday) after the day the order was placed: 3 for `:domestic` orders and 10 for `:international` ones. Any other zone raises `ArgumentError`.

We run `bundle exec rubocop` in CI, so the new files need to pass it with our `.rubocop.yml`.

When you're done, run `ruby -Itest -e 'Dir["test/**/*_test.rb"].each { |f| require File.expand_path(f) }'` and save its complete output to `test-results.txt`.
