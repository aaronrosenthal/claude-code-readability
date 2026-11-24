# frozen_string_literal: true

# Cancels an order that has not shipped yet and reports how much to refund.
# Paid orders are refunded in full; pending orders were never charged.
class OrderCanceller
  Result = Struct.new(:cancelled, :refund_cents, :reason)

  REJECTION_REASONS = {
    shipped: "order has already shipped",
    delivered: "order has already been delivered",
    cancelled: "order is already cancelled"
  }.freeze

  def initialize(order)
    @order = order
  end

  def call
    reason = REJECTION_REASONS[@order.status]
    return Result.new(false, 0, reason) if reason

    refund_cents = @order.status == :paid ? @order.total_cents : 0
    @order.status = :cancelled
    Result.new(true, refund_cents, nil)
  end
end
