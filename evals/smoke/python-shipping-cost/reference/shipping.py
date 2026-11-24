from dataclasses import dataclass, field
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

FREE_SHIPPING_THRESHOLD = Decimal("50.00")
FIRST_KILOGRAM_RATE = Decimal("4.99")
ADDITIONAL_KILOGRAM_RATE = Decimal("1.25")
OVERSIZED_SURCHARGE = Decimal("15.00")
EXPRESS_MULTIPLIER = 2
CENT = Decimal("0.01")


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
    subtotal = sum((item.price for item in order.items), start=Decimal(0))
    oversized_count = sum(1 for item in order.items if item.oversized)

    if subtotal >= FREE_SHIPPING_THRESHOLD and oversized_count == 0:
        return Decimal(0).quantize(CENT)

    total_weight = sum((item.weight_kg for item in order.items), start=Decimal(0))
    started_kilograms = int(total_weight.to_integral_value(rounding=ROUND_CEILING))
    additional_kilograms = max(started_kilograms - 1, 0)

    cost = FIRST_KILOGRAM_RATE + additional_kilograms * ADDITIONAL_KILOGRAM_RATE
    cost += oversized_count * OVERSIZED_SURCHARGE
    if order.express:
        cost *= EXPRESS_MULTIPLIER

    return cost.quantize(CENT, rounding=ROUND_HALF_UP)
