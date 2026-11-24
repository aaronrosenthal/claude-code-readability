#!/usr/bin/env bash
set -euo pipefail
cat > .rubocop.yml <<'EOF'
inherit_from: config/rubocop/base.yml

AllCops:
  Exclude:
    - "vendor/**/*"

Metrics/BlockLength:
  Exclude:
    - "test/**/*"
EOF
mkdir -p app/services
cat > app/services/points_ledger.rb <<'EOF'
# frozen_string_literal: true

# Running total of loyalty points a member has earned and spent.
class PointsLedger
  # Adds points earned from a purchase.
  def earn(points)
    @balance = balance + points
  end

  # Spends points, refusing to go below zero.
  def spend(points)
    raise ArgumentError, "insufficient points" if points > balance

    @balance = balance - points
  end

  # Current spendable balance.
  def balance
    @balance ||= 0
  end
end
EOF
mkdir -p app/services
cat > app/services/tier_thresholds.rb <<'EOF'
# frozen_string_literal: true

# Lifetime point thresholds that separate the loyalty tiers.
module TierThresholds
  SILVER = 1_000
  GOLD = 5_000
  PLATINUM = 20_000
end
EOF
mkdir -p config/rubocop
cat > config/rubocop/base.yml <<'EOF'
AllCops:
  TargetRubyVersion: 2.7
  NewCops: enable

Style/StringLiterals:
  EnforcedStyle: double_quotes

Layout/LineLength:
  Max: 100

Style/DocumentationMethod:
  Enabled: true
EOF
mkdir -p test/services
cat > test/services/loyalty_member_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/loyalty_member"

class LoyaltyMemberTest < Minitest::Test
  def test_new_members_start_in_bronze
    assert_equal :bronze, LoyaltyMember.new(lifetime_points: 0).tier
  end

  def test_tier_boundaries
    assert_equal :bronze, LoyaltyMember.new(lifetime_points: 999).tier
    assert_equal :silver, LoyaltyMember.new(lifetime_points: 1_000).tier
    assert_equal :gold, LoyaltyMember.new(lifetime_points: 5_000).tier
    assert_equal :platinum, LoyaltyMember.new(lifetime_points: 20_000).tier
  end

  def test_points_to_next_tier
    assert_equal 1, LoyaltyMember.new(lifetime_points: 999).points_to_next_tier
    assert_equal 4_000, LoyaltyMember.new(lifetime_points: 1_000).points_to_next_tier
  end

  def test_top_tier_has_no_next_tier
    assert_nil LoyaltyMember.new(lifetime_points: 50_000).points_to_next_tier
  end

  def test_perks_accumulate_by_tier
    assert_equal [], LoyaltyMember.new(lifetime_points: 0).perks
    assert_equal %w[free_shipping], LoyaltyMember.new(lifetime_points: 1_000).perks
    assert_equal %w[free_shipping early_access], LoyaltyMember.new(lifetime_points: 5_000).perks
    assert_equal %w[free_shipping early_access concierge], LoyaltyMember.new(lifetime_points: 20_000).perks
  end

  def test_negative_points_rejected
    assert_raises(ArgumentError) { LoyaltyMember.new(lifetime_points: -1) }
  end
end
EOF
mkdir -p test/services
cat > test/services/points_ledger_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/points_ledger"

class PointsLedgerTest < Minitest::Test
  def test_spend_reduces_balance
    ledger = PointsLedger.new
    ledger.earn(300)
    ledger.spend(120)

    assert_equal 180, ledger.balance
  end

  def test_cannot_overspend
    assert_raises(ArgumentError) { PointsLedger.new.spend(1) }
  end
end
EOF
mkdir -p test
cat > test/test_helper.rb <<'EOF'
# frozen_string_literal: true

$LOAD_PATH.unshift File.expand_path("../app", __dir__)

require "minitest/autorun"
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
