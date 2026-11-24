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

Metrics/BlockLength:
  Exclude:
    - "test/**/*"
EOF
mkdir -p app/services
cat > app/services/currency_formatter.rb <<'EOF'
# frozen_string_literal: true

# Formats integer cents as a dollar string such as "$1,234.50".
class CurrencyFormatter
  def self.format_cents(cents)
    dollars, remainder = cents.abs.divmod(100)
    sign = cents.negative? ? "-" : ""
    "#{sign}$#{dollars.to_s.reverse.scan(/\d{1,3}/).join(",").reverse}.#{format("%02d", remainder)}"
  end
end
EOF
mkdir -p app/services
cat > app/services/invoice_generator.rb <<'EOF'
# frozen_string_literal: true

require "date"

class InvoiceGenerator
  Invoice = Struct.new(:number, :customer, :lines, :total_cents, :due_on)

  PAYMENT_TERMS_DAYS = 30

  def initialize(sequence)
    @sequence = sequence
  end

  def generate(customer, lines, issued_on)
    total = lines.sum { |line| line[:unit_cents] * line[:quantity] }
    Invoice.new(format("INV-%06d", @sequence.next), customer, lines, total, issued_on + PAYMENT_TERMS_DAYS)
  end
end
EOF
mkdir -p app/services
cat > app/services/late_fee_policy.rb <<'EOF'
# frozen_string_literal: true

# Decides the late fee owed on an overdue invoice: a flat fee plus a monthly percentage.
class LateFeePolicy
  FLAT_FEE_CENTS = 2_500
  MONTHLY_RATE = 0.015

  def fee_cents(total_cents, days_overdue)
    return 0 if days_overdue <= 0

    months = (days_overdue / 30.0).ceil
    FLAT_FEE_CENTS + (total_cents * MONTHLY_RATE * months).round
  end
end
EOF
mkdir -p app/services
cat > app/services/payment_reconciler.rb <<'EOF'
# frozen_string_literal: true

class PaymentReconciler
  Match = Struct.new(:invoice_number, :payment_id, :difference_cents)

  def initialize(invoices, payments)
    @invoices = invoices
    @payments = payments
  end

  def reconcile
    @payments.map do |payment|
      invoice = @invoices.find { |candidate| candidate.number == payment[:reference] }
      next unless invoice

      Match.new(invoice.number, payment[:id], payment[:cents] - invoice.total_cents)
    end.compact
  end
end
EOF
mkdir -p app/services
cat > app/services/tax_calculator.rb <<'EOF'
# frozen_string_literal: true

class TaxCalculator
  RATES = { "CA" => 0.0725, "NY" => 0.04, "OR" => 0.0 }.freeze

  def initialize(state)
    @rate = RATES.fetch(state)
  end

  def tax_cents(subtotal_cents)
    (subtotal_cents * @rate).round
  end
end
EOF
mkdir -p test/services
cat > test/services/currency_formatter_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/currency_formatter"

class CurrencyFormatterTest < Minitest::Test
  def test_groups_thousands
    assert_equal "$1,234.50", CurrencyFormatter.format_cents(123_450)
  end

  def test_negative_amounts
    assert_equal "-$0.05", CurrencyFormatter.format_cents(-5)
  end
end
EOF
mkdir -p test/services
cat > test/services/invoice_generator_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/invoice_generator"

class InvoiceGeneratorTest < Minitest::Test
  def test_totals_lines_and_sets_due_date
    sequence = [41].each
    lines = [{ unit_cents: 1_250, quantity: 2 }, { unit_cents: 500, quantity: 1 }]

    invoice = InvoiceGenerator.new(sequence).generate("Acme", lines, Date.new(2024, 3, 1))

    assert_equal "INV-000041", invoice.number
    assert_equal 3_000, invoice.total_cents
    assert_equal Date.new(2024, 3, 31), invoice.due_on
  end
end
EOF
mkdir -p test/services
cat > test/services/late_fee_policy_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/late_fee_policy"

class LateFeePolicyTest < Minitest::Test
  def test_no_fee_when_not_overdue
    assert_equal 0, LateFeePolicy.new.fee_cents(10_000, 0)
  end

  def test_flat_fee_plus_monthly_percentage
    assert_equal 2_650, LateFeePolicy.new.fee_cents(10_000, 10)
  end
end
EOF
mkdir -p test/services
cat > test/services/payment_reconciler_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/invoice_generator"
require "services/payment_reconciler"

class PaymentReconcilerTest < Minitest::Test
  def test_matches_payments_to_invoices_and_reports_difference
    invoice = InvoiceGenerator::Invoice.new("INV-000001", "Acme", [], 10_000, Date.new(2024, 4, 1))
    payments = [{ id: "p1", reference: "INV-000001", cents: 9_500 }, { id: "p2", reference: "UNKNOWN", cents: 100 }]

    matches = PaymentReconciler.new([invoice], payments).reconcile

    assert_equal [PaymentReconciler::Match.new("INV-000001", "p1", -500)], matches
  end
end
EOF
mkdir -p test/services
cat > test/services/tax_calculator_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "services/tax_calculator"

class TaxCalculatorTest < Minitest::Test
  def test_rounds_to_nearest_cent
    assert_equal 73, TaxCalculator.new("CA").tax_cents(1_000)
  end

  def test_no_sales_tax_state
    assert_equal 0, TaxCalculator.new("OR").tax_cents(1_000)
  end

  def test_unknown_state_raises
    assert_raises(KeyError) { TaxCalculator.new("ZZ") }
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
