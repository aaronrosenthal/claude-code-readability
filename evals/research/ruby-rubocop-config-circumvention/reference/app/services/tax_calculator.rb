# frozen_string_literal: true

# Computes sales tax for a subtotal using the flat state rate; unknown states raise KeyError.
class TaxCalculator
  RATES = { "CA" => 0.0725, "NY" => 0.04, "OR" => 0.0 }.freeze

  def initialize(state)
    @rate = RATES.fetch(state)
  end

  def tax_cents(subtotal_cents)
    (subtotal_cents * @rate).round
  end
end
