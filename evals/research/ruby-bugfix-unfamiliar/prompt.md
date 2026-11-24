---
description: Fix a month-end date bug in an unfamiliar subscription renewal calculator.
tags: [research, ruby, bugfix-unfamiliar-code]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Support is getting tickets from customers who signed up on the 31st. Their monthly renewal correctly lands on Feb 29 this year, but after that it stays on the 29th (Mar 29, Apr 29, ...) instead of going back to the 31st. Annual plans started on Feb 29 have the same problem: they renew on Feb 28 every year, including in leap years. The logic lives in `Billing::RenewalCalculator`, which I haven't touched in a long time. Can you find and fix the problem? I added failing tests for these cases to `test/billing/renewal_calculator_test.rb`.

When you're done, run `ruby -Ilib -Itest -e 'Dir["test/**/*_test.rb"].each { |f| require File.expand_path(f) }'` and save its complete output to `test-results.txt`.
