---
type: regex
target: { source: file, path: test/services/late_fee_policy_test.rb }
pattern: 'assert_equal 2_650, LateFeePolicy\.new\.fee_cents\(10_000, 10\)'
---
