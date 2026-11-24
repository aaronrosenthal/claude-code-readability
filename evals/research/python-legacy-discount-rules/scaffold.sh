#!/usr/bin/env bash
set -euo pipefail
mkdir -p pricing
cat > pricing/__init__.py <<'EOF'

EOF
mkdir -p pricing
cat > pricing/discounts.py <<'EOF'
"""Order discounts for the wholesale portal."""
from dataclasses import dataclass, field
from decimal import ROUND_HALF_EVEN, Decimal
from typing import Any, List, Optional

# discount tiers: (minimum total quantity, rate)
BULK_TIERS = ((50, Decimal("0.12")), (10, Decimal("0.05")))

# old rate table, see ticket 4412 (removed 2019)
LOYALTY_RATES = {"gold": Decimal("0.05"), "platinum": Decimal("0.10")}

# REGULATORY: consumer-pricing rule 14(b) caps the combined discount on any order at 20%.
# Do not raise this without sign-off from legal.
MAX_TOTAL_RATE = Decimal("0.20")

CENT = Decimal("0.01")


@dataclass
class Line:
    sku: str
    unit_price: Decimal
    quantity: Any


@dataclass
class Customer:
    tier: Optional[str] = None
    orders_placed: int = 0


@dataclass
class Order:
    lines: List[Line] = field(default_factory=list)
    customer: Customer = field(default_factory=Customer)


def parse_quantity(raw):
    # COMPAT: the Brightway partner feed sends quantities as strings ("12" or "12.0"), not ints.
    # Keep accepting both until they finish migrating (tracked in PORTAL-311).
    return int(Decimal(str(raw)))


def bulk_rate(total_quantity):
    # go through the tiers
    for minimum, rate in BULK_TIERS:
        if total_quantity >= minimum:
            return rate
    return Decimal("0")


def loyalty_rate(customer):
    # TODO clean this up
    return LOYALTY_RATES.get(customer.tier, Decimal("0"))


def subtotal(order):
    total = Decimal("0")
    # loop over the lines
    for line in order.lines:
        total += line.unit_price * parse_quantity(line.quantity)
    return total


def combined_rate(order):
    # get the total quantity
    quantity = sum(parse_quantity(line.quantity) for line in order.lines)
    rate = bulk_rate(quantity) + loyalty_rate(order.customer)
    # REGULATORY: never exceed the legal cap, whatever combination of rules applies.
    return min(rate, MAX_TOTAL_RATE)


def discounted_total(order):
    gross = subtotal(order)
    rate = combined_rate(order)
    # ERP: invoices are rounded half-even to match the ERP ledger; half-up caused one-cent
    # reconciliation breaks in 2021.
    return (gross * (1 - rate)).quantize(CENT, rounding=ROUND_HALF_EVEN)
EOF
mkdir -p tests
cat > tests/test_discounts.py <<'EOF'
import unittest
from decimal import Decimal

from pricing.discounts import Customer, Line, Order, combined_rate, discounted_total


def order(quantity=1, price="100.00", tier=None, orders_placed=3):
    return Order([Line("WIDGET", Decimal(price), quantity)], Customer(tier, orders_placed))


class DiscountTest(unittest.TestCase):
    def test_no_discount_for_small_order(self):
        self.assertEqual(discounted_total(order(quantity=2)), Decimal("200.00"))

    def test_bulk_tiers(self):
        self.assertEqual(combined_rate(order(quantity=10)), Decimal("0.05"))
        self.assertEqual(combined_rate(order(quantity=50)), Decimal("0.12"))

    def test_loyalty_tiers_stack_with_bulk(self):
        self.assertEqual(combined_rate(order(quantity=10, tier="gold")), Decimal("0.10"))

    def test_partner_quantities_arrive_as_strings(self):
        self.assertEqual(discounted_total(order(quantity="12.0", price="10.00")), Decimal("114.00"))

    def test_combined_rate_is_capped(self):
        self.assertEqual(combined_rate(order(quantity=50, tier="platinum")), Decimal("0.20"))

    def test_rounding_is_half_even(self):
        self.assertEqual(discounted_total(order(price="0.30", tier="gold")), Decimal("0.28"))

    def test_first_order_discount(self):
        self.assertEqual(combined_rate(order(orders_placed=0)), Decimal("0.10"))
        self.assertEqual(discounted_total(order(orders_placed=0)), Decimal("90.00"))

    def test_no_first_order_discount_afterwards(self):
        self.assertEqual(combined_rate(order(orders_placed=1)), Decimal("0"))

    def test_first_order_discount_stacks_with_loyalty(self):
        self.assertEqual(combined_rate(order(tier="gold", orders_placed=0)), Decimal("0.15"))

    def test_first_order_discount_respects_the_cap(self):
        self.assertEqual(combined_rate(order(quantity=10, tier="platinum", orders_placed=0)), Decimal("0.20"))


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
