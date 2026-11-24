#!/usr/bin/env bash
set -euo pipefail
cat > shipping.py <<'EOF'
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class Item:
    price: Decimal
    weight_kg: Decimal
    oversized: bool = False


@dataclass(frozen=True)
class Order:
    items: list = field(default_factory=list)
    express: bool = False


def shipping_cost(order: Order) -> Decimal:
    raise NotImplementedError
EOF
cat > test_shipping.py <<'EOF'
import unittest
from decimal import Decimal

from shipping import Item, Order, shipping_cost


def item(price, weight, oversized=False):
    return Item(Decimal(price), Decimal(weight), oversized)


class ShippingCostTest(unittest.TestCase):
    def test_free_over_threshold(self):
        self.assertEqual(shipping_cost(Order([item("50.00", "3")])), Decimal("0.00"))

    def test_oversized_cancels_free_shipping(self):
        self.assertEqual(shipping_cost(Order([item("80.00", "1", True)])), Decimal("19.99"))

    def test_first_kilogram(self):
        self.assertEqual(shipping_cost(Order([item("10.00", "0.4")])), Decimal("4.99"))

    def test_started_kilograms(self):
        self.assertEqual(shipping_cost(Order([item("10.00", "2.1")])), Decimal("7.49"))

    def test_express_doubles_after_surcharge(self):
        self.assertEqual(shipping_cost(Order([item("10.00", "1", True)], express=True)), Decimal("39.98"))

    def test_empty_order(self):
        self.assertEqual(shipping_cost(Order([])), Decimal("4.99"))


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
