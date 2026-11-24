"""Order discounts for the wholesale portal."""
from dataclasses import dataclass, field
from decimal import ROUND_HALF_EVEN, Decimal
from typing import Any, List, Optional

# discount tiers: (minimum total quantity, rate)
BULK_TIERS = ((50, Decimal("0.12")), (10, Decimal("0.05")))

# old rate table, see ticket 4412 (removed 2019)
LOYALTY_RATES = {"gold": Decimal("0.05"), "platinum": Decimal("0.10")}

FIRST_ORDER_RATE = Decimal("0.10")

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


def first_order_rate(customer):
    return FIRST_ORDER_RATE if customer.orders_placed == 0 else Decimal("0")


def subtotal(order):
    total = Decimal("0")
    # loop over the lines
    for line in order.lines:
        total += line.unit_price * parse_quantity(line.quantity)
    return total


def combined_rate(order):
    # get the total quantity
    quantity = sum(parse_quantity(line.quantity) for line in order.lines)
    rate = bulk_rate(quantity) + loyalty_rate(order.customer) + first_order_rate(order.customer)
    # REGULATORY: never exceed the legal cap, whatever combination of rules applies.
    return min(rate, MAX_TOTAL_RATE)


def discounted_total(order):
    gross = subtotal(order)
    rate = combined_rate(order)
    # ERP: invoices are rounded half-even to match the ERP ledger; half-up caused one-cent
    # reconciliation breaks in 2021.
    return (gross * (1 - rate)).quantize(CENT, rounding=ROUND_HALF_EVEN)
