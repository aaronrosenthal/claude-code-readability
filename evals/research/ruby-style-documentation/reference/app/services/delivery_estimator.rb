# frozen_string_literal: true

require "date"

# Estimates the delivery date of an order by counting business days from the day it was placed.
class DeliveryEstimator
  BUSINESS_DAYS_BY_ZONE = { domestic: 3, international: 10 }.freeze

  def initialize(order)
    @order = order
  end

  def estimated_on
    days_remaining = BUSINESS_DAYS_BY_ZONE.fetch(@order.zone) { raise ArgumentError, "unknown zone: #{@order.zone}" }
    date = @order.placed_on
    while days_remaining.positive?
      date += 1
      days_remaining -= 1 if business_day?(date)
    end
    date
  end

  private

  def business_day?(date)
    !date.saturday? && !date.sunday?
  end
end
