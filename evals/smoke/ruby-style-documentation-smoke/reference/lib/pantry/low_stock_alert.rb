# frozen_string_literal: true

module Pantry
  # Picks the items on a shelf that are due for reordering: any item whose
  # quantity has fallen to the threshold or below.
  class LowStockAlert
    def initialize(threshold:)
      raise ArgumentError, "threshold must not be negative" if threshold.negative?

      @threshold = threshold
    end

    def items_to_reorder(shelf)
      shelf.items.select { |item| item.quantity <= @threshold }
    end
  end
end
