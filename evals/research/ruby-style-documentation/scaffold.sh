#!/usr/bin/env bash
set -euo pipefail
cat > .rubocop.yml <<'EOF'
AllCops:
  TargetRubyVersion: 2.7
  NewCops: enable
  Exclude:
    - "vendor/**/*"
    - "db/**/*"

Style/StringLiterals:
  EnforcedStyle: double_quotes

Layout/LineLength:
  Max: 110

Metrics/MethodLength:
  Max: 15

Metrics/BlockLength:
  Exclude:
    - "test/**/*"

Style/FrozenStringLiteralComment:
  Enabled: true
EOF
mkdir -p app/models
cat > app/models/order.rb <<'EOF'
# frozen_string_literal: true

# An order placed through checkout, from first payment attempt to delivery.
class Order
  STATUSES = %i[pending paid shipped delivered cancelled].freeze

  attr_reader :id, :customer_email, :total_cents, :placed_on, :zone
  attr_accessor :status

  def initialize(id:, customer_email:, total_cents:, placed_on:, status: :pending, zone: :domestic)
    @id = id
    @customer_email = customer_email
    @total_cents = total_cents
    @placed_on = placed_on
    @status = status
    @zone = zone
  end
end
EOF
mkdir -p app/services
cat > app/services/order_confirmation.rb <<'EOF'
# frozen_string_literal: true

# Builds the confirmation email payload sent after checkout completes.
class OrderConfirmation
  def initialize(order)
    @order = order
  end

  def to_h
    {
      to: @order.customer_email,
      subject: "Order ##{@order.id} confirmed",
      total: format_total(@order.total_cents)
    }
  end

  private

  def format_total(cents)
    format("$%<dollars>d.%<cents>02d", dollars: cents / 100, cents: cents % 100)
  end
end
EOF
mkdir -p app/services
cat > app/services/refund_calculator.rb <<'EOF'
# frozen_string_literal: true

# Works out how much of an order can be refunded for a given number of days since delivery.
class RefundCalculator
  FULL_REFUND_DAYS = 14
  PARTIAL_REFUND_DAYS = 30

  def initialize(order)
    @order = order
  end

  def refund_cents(days_since_delivery)
    if days_since_delivery <= FULL_REFUND_DAYS
      @order.total_cents
    elsif days_since_delivery <= PARTIAL_REFUND_DAYS
      @order.total_cents / 2
    else
      0
    end
  end
end
EOF
mkdir -p test/services
cat > test/services/delivery_estimator_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/delivery_estimator"

class DeliveryEstimatorTest < Minitest::Test
  def order_placed_on(date, zone)
    Order.new(id: 3, customer_email: "lee@example.com", total_cents: 1_000, placed_on: date, zone: zone)
  end

  def test_domestic_orders_take_three_business_days
    friday = Date.new(2024, 3, 1)

    assert_equal Date.new(2024, 3, 6), DeliveryEstimator.new(order_placed_on(friday, :domestic)).estimated_on
  end

  def test_domestic_order_placed_midweek
    tuesday = Date.new(2024, 3, 5)

    assert_equal Date.new(2024, 3, 8), DeliveryEstimator.new(order_placed_on(tuesday, :domestic)).estimated_on
  end

  def test_international_orders_take_ten_business_days
    friday = Date.new(2024, 3, 1)

    assert_equal Date.new(2024, 3, 15), DeliveryEstimator.new(order_placed_on(friday, :international)).estimated_on
  end

  def test_order_placed_on_a_weekend_counts_from_the_next_business_day
    saturday = Date.new(2024, 3, 2)

    assert_equal Date.new(2024, 3, 6), DeliveryEstimator.new(order_placed_on(saturday, :domestic)).estimated_on
  end

  def test_unknown_zone_is_an_error
    assert_raises(ArgumentError) { DeliveryEstimator.new(order_placed_on(Date.new(2024, 3, 1), :orbital)).estimated_on }
  end
end
EOF
mkdir -p test/services
cat > test/services/order_canceller_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/order_canceller"

class OrderCancellerTest < Minitest::Test
  def build_order(status)
    Order.new(id: 9, customer_email: "kim@example.com", total_cents: 8_400, placed_on: Date.new(2024, 3, 1),
              status: status)
  end

  def test_paid_order_is_cancelled_with_full_refund
    order = build_order(:paid)

    result = OrderCanceller.new(order).call

    assert result.cancelled
    assert_equal 8_400, result.refund_cents
    assert_equal :cancelled, order.status
  end

  def test_pending_order_is_cancelled_without_refund
    order = build_order(:pending)

    result = OrderCanceller.new(order).call

    assert result.cancelled
    assert_equal 0, result.refund_cents
    assert_equal :cancelled, order.status
  end

  def test_shipped_order_cannot_be_cancelled
    order = build_order(:shipped)

    result = OrderCanceller.new(order).call

    refute result.cancelled
    assert_equal 0, result.refund_cents
    assert_equal "order has already shipped", result.reason
    assert_equal :shipped, order.status
  end

  def test_already_cancelled_order_is_rejected
    result = OrderCanceller.new(build_order(:cancelled)).call

    refute result.cancelled
    assert_equal "order is already cancelled", result.reason
  end

  def test_delivered_order_is_rejected
    result = OrderCanceller.new(build_order(:delivered)).call

    refute result.cancelled
    assert_equal "order has already been delivered", result.reason
  end
end
EOF
mkdir -p test/services
cat > test/services/order_confirmation_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/order_confirmation"

class OrderConfirmationTest < Minitest::Test
  def test_payload_has_subject_and_formatted_total
    order = Order.new(id: 7, customer_email: "sam@example.com", total_cents: 12_905, placed_on: Date.new(2024, 3, 1))

    assert_equal({ to: "sam@example.com", subject: "Order #7 confirmed", total: "$129.05" },
                 OrderConfirmation.new(order).to_h)
  end
end
EOF
mkdir -p test/services
cat > test/services/refund_calculator_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/refund_calculator"

class RefundCalculatorTest < Minitest::Test
  def setup
    @order = Order.new(id: 1, customer_email: "a@example.com", total_cents: 5_000, placed_on: Date.new(2024, 3, 1))
  end

  def test_full_refund_inside_two_weeks
    assert_equal 5_000, RefundCalculator.new(@order).refund_cents(14)
  end

  def test_half_refund_inside_thirty_days
    assert_equal 2_500, RefundCalculator.new(@order).refund_cents(20)
  end

  def test_no_refund_after_thirty_days
    assert_equal 0, RefundCalculator.new(@order).refund_cents(31)
  end
end
EOF
mkdir -p test
cat > test/test_helper.rb <<'EOF'
# frozen_string_literal: true

$LOAD_PATH.unshift File.expand_path("../app", __dir__)

require "date"
require "minitest/autorun"
require "models/order"
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
