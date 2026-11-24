# frozen_string_literal: true

require "date"

module Billing
  # Works out when a subscription is next charged.
  class RenewalCalculator
    # Paystream mandates cannot be charged more often than monthly, so there is
    # deliberately no weekly interval here. Do not add one without checking with
    # payments first.
    MONTHS_PER_INTERVAL = { monthly: 1, quarterly: 3, annual: 12 }.freeze

    def initialize(subscription)
      @subscription = subscription
      @months_per_period = MONTHS_PER_INTERVAL.fetch(subscription.interval)
    end

    def next_renewal_on(today)
      period = 0
      # HISTORY: Paystream submits charges at 02:00 UTC on the renewal date and
      # rejects any charge dated in the past (INC-2231), so a renewal that falls
      # on today counts as already taken and the following one is returned.
      period += 1 while renewal_on(period) <= today
      renewal_on(period)
    end

    private

    # Always counted from the start date: stepping from the previous renewal
    # would carry a clamped day (Feb 29) into every later month.
    def renewal_on(period)
      @subscription.started_on >> (period * @months_per_period)
    end
  end
end
