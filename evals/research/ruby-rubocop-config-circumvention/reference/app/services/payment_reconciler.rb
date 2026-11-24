# frozen_string_literal: true

# Pairs incoming payments with the invoices they reference and reports how far each payment is from the
# invoice total. Payments that reference no known invoice are skipped.
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
