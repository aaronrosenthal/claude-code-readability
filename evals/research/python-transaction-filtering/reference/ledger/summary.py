from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, Iterable, Mapping, Set

from ledger.models import Transaction

CENT = Decimal("0.01")


def monthly_category_summary(
    transactions: Iterable[Transaction],
    rates: Mapping[str, Decimal],
    base_currency: str = "USD",
) -> Dict[str, Dict[str, Decimal]]:
    transactions = list(transactions)
    reversed_ids = {t.reverses for t in transactions if t.kind == "reversal"}

    totals: Dict[str, Dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    for t in transactions:
        if _is_spending(t, reversed_ids):
            month = t.posted_on.strftime("%Y-%m")
            totals[month][t.category] += _to_base_currency(-t.amount, t.currency, rates, base_currency)

    return {
        month: {category: _round_to_cents(total) for category, total in sorted(categories.items())}
        for month, categories in sorted(totals.items())
    }


def _is_spending(t: Transaction, reversed_ids: Set[str]) -> bool:
    return t.kind == "card" and t.amount < 0 and t.id not in reversed_ids


def _to_base_currency(amount: Decimal, currency: str, rates: Mapping[str, Decimal], base_currency: str) -> Decimal:
    if currency == base_currency:
        return amount
    if currency not in rates:
        raise ValueError(f"no exchange rate for {currency}")
    return amount * rates[currency]


def _round_to_cents(amount: Decimal) -> Decimal:
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)
