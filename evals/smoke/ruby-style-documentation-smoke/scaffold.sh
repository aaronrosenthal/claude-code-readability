#!/usr/bin/env bash
set -euo pipefail
cat > .rubocop.yml <<'EOF'
AllCops:
  TargetRubyVersion: 2.7
  NewCops: enable
  Exclude:
    - "vendor/**/*"

Style/StringLiterals:
  EnforcedStyle: double_quotes

Layout/LineLength:
  Max: 100
EOF
mkdir -p lib
cat > lib/pantry.rb <<'EOF'
# frozen_string_literal: true

require "pantry/item"
require "pantry/shelf"
EOF
mkdir -p lib/pantry
cat > lib/pantry/item.rb <<'EOF'
# frozen_string_literal: true

module Pantry
  # A stocked product with a running quantity.
  class Item
    attr_reader :sku, :name
    attr_accessor :quantity

    def initialize(sku:, name:, quantity: 0)
      @sku = sku
      @name = name
      @quantity = quantity
    end
  end
end
EOF
mkdir -p lib/pantry
cat > lib/pantry/shelf.rb <<'EOF'
# frozen_string_literal: true

module Pantry
  # Holds items by SKU and answers simple stock questions.
  class Shelf
    def initialize(items = [])
      @items = items.each_with_object({}) { |item, by_sku| by_sku[item.sku] = item }
    end

    def add(item)
      @items[item.sku] = item
    end

    def find(sku)
      @items.fetch(sku)
    end

    def items
      @items.values
    end
  end
end
EOF
mkdir -p test
cat > test/low_stock_alert_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"
require "pantry/low_stock_alert"

class LowStockAlertTest < Minitest::Test
  def setup
    @rice = Pantry::Item.new(sku: "RICE-1", name: "Rice", quantity: 2)
    @beans = Pantry::Item.new(sku: "BEAN-1", name: "Beans", quantity: 5)
    @flour = Pantry::Item.new(sku: "FLOUR-1", name: "Flour", quantity: 12)
    @shelf = Pantry::Shelf.new([@rice, @beans, @flour])
  end

  def test_returns_items_at_or_below_threshold
    alert = Pantry::LowStockAlert.new(threshold: 5)

    assert_equal [@rice, @beans], alert.items_to_reorder(@shelf)
  end

  def test_returns_empty_when_everything_is_stocked
    alert = Pantry::LowStockAlert.new(threshold: 1)

    assert_empty alert.items_to_reorder(@shelf)
  end

  def test_rejects_negative_threshold
    assert_raises(ArgumentError) { Pantry::LowStockAlert.new(threshold: -1) }
  end
end
EOF
mkdir -p test
cat > test/shelf_test.rb <<'EOF'
# frozen_string_literal: true

require "test_helper"

class ShelfTest < Minitest::Test
  def test_find_returns_added_item
    shelf = Pantry::Shelf.new
    shelf.add(Pantry::Item.new(sku: "RICE-1", name: "Rice", quantity: 4))

    assert_equal "Rice", shelf.find("RICE-1").name
  end
end
EOF
mkdir -p test
cat > test/test_helper.rb <<'EOF'
# frozen_string_literal: true

require "minitest/autorun"
require "pantry"
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
