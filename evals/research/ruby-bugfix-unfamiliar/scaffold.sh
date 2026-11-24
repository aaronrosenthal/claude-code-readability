#!/usr/bin/env bash
set -euo pipefail
mkdir -p lib
cat > lib/billing.rb <<'EOF'
# frozen_string_literal: true

require "billing/subscription"
require "billing/renewal_calculator"
EOF
mkdir -p lib/billing
cat > lib/billing/renewal_calculator.rb <<'EOF'
# frozen_string_literal: true

require "date"

module Billing
  # Works out when a subscription is next charged.
  class RenewalCalculator
    # supported intervals: monthly and annual
    # Paystream mandates cannot be charged more often than monthly, so there is
    # deliberately no weekly interval here. Do not add one without checking with
    # payments first.
    MONTHS_PER_INTERVAL = { monthly: 1, quarterly: 3, annual: 12 }.freeze

    def initialize(subscription)
      @subscription = subscription
    end

    # returns the next renewal date after today
    def next_renewal_on(today)
      months = MONTHS_PER_INTERVAL.fetch(@subscription.interval)
      # start from the signup date
      renewal = @subscription.started_on
      # HISTORY: Paystream submits charges at 02:00 UTC on the renewal date and
      # rejects any charge dated in the past (INC-2231), so a renewal that falls
      # on today counts as already taken and the following one is returned.
      while renewal <= today
        renewal >>= months # move forward one billing period
      end
      renewal
    end
  end
end
EOF
mkdir -p lib/billing
cat > lib/billing/subscription.rb <<'EOF'
# frozen_string_literal: true

require "date"

module Billing
  # A customer's recurring plan as stored by the billing service.
  Subscription = Struct.new(:id, :plan_id, :started_on, :interval, keyword_init: true)
end
EOF
mkdir -p test/billing
cat > test/billing/renewal_calculator_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"

class RenewalCalculatorTest < Minitest::Test
  def calculator(started_on, interval)
    subscription = Billing::Subscription.new(id: 1, plan_id: "pro", started_on: started_on, interval: interval)
    Billing::RenewalCalculator.new(subscription)
  end

  def test_monthly_renewal_mid_month
    assert_equal Date.new(2024, 4, 15), calculator(Date.new(2024, 1, 15), :monthly).next_renewal_on(Date.new(2024, 3, 20))
  end

  def test_renewal_due_today_rolls_to_the_next_period
    assert_equal Date.new(2024, 4, 15), calculator(Date.new(2024, 1, 15), :monthly).next_renewal_on(Date.new(2024, 3, 15))
  end

  def test_first_renewal_for_future_start_is_the_start_date
    assert_equal Date.new(2024, 6, 1), calculator(Date.new(2024, 6, 1), :monthly).next_renewal_on(Date.new(2024, 5, 1))
  end

  def test_quarterly_renewal
    assert_equal Date.new(2024, 7, 10), calculator(Date.new(2024, 1, 10), :quarterly).next_renewal_on(Date.new(2024, 4, 10))
  end

  def test_month_end_renewal_clamps_to_short_month
    assert_equal Date.new(2024, 2, 29), calculator(Date.new(2024, 1, 31), :monthly).next_renewal_on(Date.new(2024, 1, 31))
  end

  def test_month_end_renewal_returns_to_the_31st_after_a_short_month
    assert_equal Date.new(2024, 3, 31), calculator(Date.new(2024, 1, 31), :monthly).next_renewal_on(Date.new(2024, 2, 29))
  end

  def test_month_end_renewal_does_not_drift_across_the_year
    assert_equal Date.new(2024, 10, 31), calculator(Date.new(2024, 1, 31), :monthly).next_renewal_on(Date.new(2024, 9, 30))
  end

  def test_leap_day_annual_renewal_uses_feb_28_then_returns_to_feb_29
    plan = calculator(Date.new(2024, 2, 29), :annual)

    assert_equal Date.new(2025, 2, 28), plan.next_renewal_on(Date.new(2024, 3, 1))
    assert_equal Date.new(2028, 2, 29), plan.next_renewal_on(Date.new(2027, 3, 1))
  end

  def test_unknown_interval_raises
    assert_raises(KeyError) { calculator(Date.new(2024, 1, 1), :weekly).next_renewal_on(Date.new(2024, 1, 2)) }
  end
end
EOF
mkdir -p test
cat > test/test_helper.rb <<'EOF'
# frozen_string_literal: true

require "minitest/autorun"
require "billing"
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
