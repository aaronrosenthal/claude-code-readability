#!/usr/bin/env bash
set -euo pipefail
cat > .pylintrc <<'EOF'
[MASTER]
ignore=tests
jobs=1

[MESSAGES CONTROL]
disable=too-few-public-methods,
        fixme

[FORMAT]
max-line-length=100

[DESIGN]
max-args=6
EOF
mkdir -p tests
cat > tests/test_stock.py <<'EOF'
import unittest

from warehouse import stock


class StockTest(unittest.TestCase):
    def test_reorder_quantity_covers_lead_time_demand(self):
        self.assertEqual(stock.reorder_quantity(20, 5, 7), 15)

    def test_reorder_quantity_never_negative(self):
        self.assertEqual(stock.reorder_quantity(100, 1, 3), 0)

    def test_low_stock_skus_sorted_and_normalised(self):
        levels = {"b-2": 1, "a-1": 0, "c-3": 50}
        thresholds = {"b-2": 5, "a-1": 2, "c-3": 10}
        self.assertEqual(stock.low_stock_skus(levels, thresholds), ["A-1", "B-2"])

    def test_apply_movements_returns_new_levels(self):
        levels = {"a": 5}
        self.assertEqual(stock.apply_movements(levels, [("a", -2), ("b", 4)]), {"a": 3, "b": 4})
        self.assertEqual(levels, {"a": 5})

    def test_apply_movements_rejects_negative_stock(self):
        with self.assertRaises(ValueError):
            stock.apply_movements({"a": 1}, [("a", -2)])

    def test_total_by_warehouse(self):
        rows = [("east", "a", 3), ("west", "a", 1), ("east", "b", 2)]
        self.assertEqual(stock.total_by_warehouse(rows), {"east": 5, "west": 1})


if __name__ == "__main__":
    unittest.main()
EOF
mkdir -p warehouse
cat > warehouse/__init__.py <<'EOF'
"""Stock bookkeeping for the regional warehouses."""
EOF
mkdir -p warehouse
cat > warehouse/stock.py <<'EOF'
from collections import defaultdict


def _normalise_sku(sku):
    return sku.strip().upper()


def reorder_quantity(on_hand, daily_demand, lead_time_days, safety_stock=0):
    expected = daily_demand * lead_time_days + safety_stock
    return max(0, expected - on_hand)


def low_stock_skus(levels, thresholds):
    return sorted(
        _normalise_sku(sku)
        for sku, quantity in levels.items()
        if quantity < thresholds.get(sku, 0)
    )


def apply_movements(levels, movements):
    updated = dict(levels)
    for sku, delta in movements:
        updated[sku] = updated.get(sku, 0) + delta
        if updated[sku] < 0:
            raise ValueError(f"stock for {sku} would go negative")
    return updated


def total_by_warehouse(rows):
    totals = defaultdict(int)
    for warehouse, _sku, quantity in rows:
        totals[warehouse] += quantity
    return dict(totals)
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
