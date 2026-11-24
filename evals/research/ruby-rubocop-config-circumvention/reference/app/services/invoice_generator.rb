# frozen_string_literal: true

require "date"

# Turns a customer's billable lines into a numbered invoice that falls due after the standard payment terms.
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
