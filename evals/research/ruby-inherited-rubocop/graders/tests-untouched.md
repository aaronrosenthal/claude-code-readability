---
type: regex
target: { source: file, path: test/services/loyalty_member_test.rb }
pattern: 'assert_nil LoyaltyMember\.new\(lifetime_points: 50_000\)\.points_to_next_tier'
---
