---
description: Add one small class to a Ruby gem-style project whose RuboCop config requires class documentation.
tags: [smoke, ruby, lint-documentation]
runs: 3
max_turns: 25
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill]
---

We want a low-stock report for the pantry app. Please add `Pantry::LowStockAlert` in `lib/pantry/low_stock_alert.rb` and require it from `lib/pantry.rb`. It takes a `threshold:` keyword (negative thresholds raise `ArgumentError`), and `items_to_reorder(shelf)` returns the shelf's items whose quantity is at or below the threshold, in shelf order. The tests are already in `test/low_stock_alert_test.rb`. CI runs `bundle exec rubocop`, so keep the file clean for our `.rubocop.yml`.

When you're done, run `ruby -Ilib -Itest -e 'Dir["test/**/*_test.rb"].each { |f| require File.expand_path(f) }'` and save its complete output to `test-results.txt`.
