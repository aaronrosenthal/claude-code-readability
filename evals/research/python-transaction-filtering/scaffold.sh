#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# ledger

Helpers for turning exported bank transactions into reports for the finance team.
Run the tests with `python3 -m unittest discover -s tests -v`.
EOF
mkdir -p ledger
cat > ledger/__init__.py <<'EOF'

EOF
mkdir -p ledger
cat > ledger/models.py <<'EOF'
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class Transaction:
    id: str
    posted_on: date
    amount: Decimal  # negative for money leaving the account
    currency: str
    category: str
    kind: str = "card"  # "card", "transfer" or "reversal"
    reverses: Optional[str] = None  # id of the charge a reversal cancels
EOF
mkdir -p ledger
cat > ledger/summary.py <<'EOF'
from decimal import Decimal
from typing import Dict, Iterable, Mapping

from ledger.models import Transaction


def monthly_category_summary(
    transactions: Iterable[Transaction],
    rates: Mapping[str, Decimal],
    base_currency: str = "USD",
) -> Dict[str, Dict[str, Decimal]]:
    raise NotImplementedError
EOF
mkdir -p tests
cat > tests/test_summary.py <<'EOF'
import unittest
from datetime import date
from decimal import Decimal

from ledger.models import Transaction
from ledger.summary import monthly_category_summary

RATES = {"EUR": Decimal("1.10"), "GBP": Decimal("1.25")}


def tx(id, day, amount, category="Groceries", currency="USD", **extra):
    return Transaction(id, day, Decimal(amount), currency, category, **extra)


class MonthlyCategorySummaryTest(unittest.TestCase):
    def test_groups_spending_by_month_and_category(self):
        transactions = [
            tx("1", date(2024, 1, 5), "-20.00"),
            tx("2", date(2024, 1, 20), "-30.50"),
            tx("3", date(2024, 1, 21), "-12.00", "Transport"),
            tx("4", date(2024, 2, 2), "-8.25"),
        ]
        self.assertEqual(
            monthly_category_summary(transactions, RATES),
            {
                "2024-01": {"Groceries": Decimal("50.50"), "Transport": Decimal("12.00")},
                "2024-02": {"Groceries": Decimal("8.25")},
            },
        )

    def test_ignores_income(self):
        transactions = [tx("1", date(2024, 1, 5), "1500.00", "Salary"), tx("2", date(2024, 1, 6), "-9.99", "Media")]
        self.assertEqual(monthly_category_summary(transactions, RATES), {"2024-01": {"Media": Decimal("9.99")}})

    def test_excludes_internal_transfers(self):
        transactions = [
            tx("1", date(2024, 1, 5), "-500.00", "Savings", kind="transfer"),
            tx("2", date(2024, 1, 6), "-4.00", "Coffee"),
        ]
        self.assertEqual(monthly_category_summary(transactions, RATES), {"2024-01": {"Coffee": Decimal("4.00")}})

    def test_excludes_reversed_charge_and_its_reversal(self):
        transactions = [
            tx("1", date(2024, 1, 5), "-60.00", "Electronics"),
            tx("2", date(2024, 1, 9), "60.00", "Electronics", kind="reversal", reverses="1"),
            tx("3", date(2024, 1, 10), "-5.00", "Coffee"),
        ]
        self.assertEqual(monthly_category_summary(transactions, RATES), {"2024-01": {"Coffee": Decimal("5.00")}})

    def test_reversal_in_a_later_month_still_cancels_the_charge(self):
        transactions = [
            tx("1", date(2024, 1, 30), "-60.00", "Electronics"),
            tx("2", date(2024, 2, 3), "60.00", "Electronics", kind="reversal", reverses="1"),
        ]
        self.assertEqual(monthly_category_summary(transactions, RATES), {})

    def test_converts_to_base_currency(self):
        transactions = [
            tx("1", date(2024, 3, 1), "-10.00", currency="EUR"),
            tx("2", date(2024, 3, 2), "-10.00", currency="GBP"),
            tx("3", date(2024, 3, 3), "-10.00"),
        ]
        self.assertEqual(monthly_category_summary(transactions, RATES), {"2024-03": {"Groceries": Decimal("33.50")}})

    def test_rounds_half_up(self):
        transactions = [tx("1", date(2024, 3, 1), "-0.05", currency="EUR")]
        self.assertEqual(monthly_category_summary(transactions, RATES), {"2024-03": {"Groceries": Decimal("0.06")}})

    def test_rounds_the_total_not_each_transaction(self):
        transactions = [
            tx("1", date(2024, 3, 4), "-0.15", currency="EUR"),
            tx("2", date(2024, 3, 5), "-0.15", currency="EUR"),
        ]
        self.assertEqual(monthly_category_summary(transactions, RATES), {"2024-03": {"Groceries": Decimal("0.33")}})

    def test_unknown_currency_raises(self):
        with self.assertRaises(ValueError):
            monthly_category_summary([tx("1", date(2024, 1, 1), "-1.00", currency="JPY")], RATES)


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
