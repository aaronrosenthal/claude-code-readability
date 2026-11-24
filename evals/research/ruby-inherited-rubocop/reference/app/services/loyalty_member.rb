# frozen_string_literal: true

require "services/tier_thresholds"

# A loyalty program member whose tier and perks follow from lifetime points earned.
class LoyaltyMember
  TIERS = [
    [:platinum, TierThresholds::PLATINUM],
    [:gold, TierThresholds::GOLD],
    [:silver, TierThresholds::SILVER]
  ].freeze

  PERKS = {
    silver: "free_shipping",
    gold: "early_access",
    platinum: "concierge"
  }.freeze

  def initialize(lifetime_points:)
    raise ArgumentError, "lifetime points cannot be negative" if lifetime_points.negative?

    @lifetime_points = lifetime_points
  end

  # The member's current tier: :bronze, :silver, :gold or :platinum.
  def tier
    TIERS.each do |name, threshold|
      return name if @lifetime_points >= threshold
    end
    :bronze
  end

  # Lifetime points still needed to reach the next tier, or nil at the top tier.
  def points_to_next_tier
    next_threshold = TIERS.map(&:last).reverse.find { |threshold| threshold > @lifetime_points }
    next_threshold && next_threshold - @lifetime_points
  end

  # Perks unlocked so far, lowest tier first. Higher tiers keep the perks of lower ones.
  def perks
    unlocked = TIERS.reverse.select { |_, threshold| @lifetime_points >= threshold }
    unlocked.map { |name, _| PERKS.fetch(name) }
  end
end
