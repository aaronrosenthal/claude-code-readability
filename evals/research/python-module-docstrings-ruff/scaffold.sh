#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# billing

Invoice and credit helpers used by the accounts-receivable service.
CI runs `ruff check .` and the unit tests (`python3 -m unittest discover -s tests`).
EOF
cat > pyproject.toml <<'EOF'
[project]
name = "billing"
version = "0.4.0"
requires-python = ">=3.9"

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "D"]

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["D"]
EOF
mkdir -p billing
cat > billing/__init__.py <<'EOF'
"""Invoice and credit helpers for accounts receivable."""
EOF
mkdir -p billing
cat > billing/credits.py <<'EOF'
"""Customer credit balance calculations."""
from decimal import Decimal
from typing import Iterable


def apply_credit(amount_due: Decimal, credit_balance: Decimal) -> Decimal:
    """Reduce an amount due by the customer's available credit.

    Args:
        amount_due: Amount still owed on the invoice.
        credit_balance: Credit the customer has available.

    Returns:
        The amount left to pay, never below zero.
    """
    return max(Decimal("0"), amount_due - credit_balance)


def remaining_credit(credit_balance: Decimal, used: Iterable[Decimal]) -> Decimal:
    """Compute how much credit is left after some has been used.

    Args:
        credit_balance: Credit the customer started with.
        used: Amounts of credit already consumed.

    Returns:
        The unused credit.

    Raises:
        ValueError: If more credit was used than the customer had.
    """
    left = credit_balance - sum(used, Decimal("0"))
    if left < 0:
        raise ValueError("more credit used than available")
    return left
EOF
mkdir -p billing
cat > billing/models.py <<'EOF'
"""Data classes shared by the billing modules."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Invoice:
    """An issued invoice.

    Attributes:
        number: Human readable invoice number, for example ``INV-1042``.
        total: Amount charged to the customer, in the invoice currency.
        currency: ISO 4217 currency code.
        issued_on: Date the invoice was issued.
        status: One of ``"open"``, ``"paid"`` or ``"void"``.
    """

    number: str
    total: Decimal
    currency: str
    issued_on: date
    status: str = "open"


@dataclass(frozen=True)
class Refund:
    """A refund paid out against an invoice.

    Attributes:
        invoice_number: Number of the invoice the refund belongs to.
        amount: Amount returned to the customer, in the invoice currency.
        reason: Free-text reason recorded by the agent.
        issued_on: Date the refund was issued.
    """

    invoice_number: str
    amount: Decimal
    reason: str
    issued_on: date
EOF
mkdir -p tests
cat > tests/test_refunds.py <<'EOF'
import unittest
from datetime import date
from decimal import Decimal

from billing.models import Invoice, Refund
from billing.refunds import issue_refund, refundable_amount

INVOICE = Invoice("INV-1042", Decimal("120.00"), "EUR", date(2024, 5, 1), status="paid")


def refund(amount, number="INV-1042"):
    return Refund(number, Decimal(amount), "damaged", date(2024, 5, 10))


class RefundableAmountTest(unittest.TestCase):
    def test_full_total_when_nothing_was_refunded(self):
        self.assertEqual(refundable_amount(INVOICE, []), Decimal("120.00"))

    def test_subtracts_prior_refunds(self):
        self.assertEqual(refundable_amount(INVOICE, [refund("20.00"), refund("5.50")]), Decimal("94.50"))

    def test_ignores_refunds_for_other_invoices(self):
        self.assertEqual(refundable_amount(INVOICE, [refund("50.00", "INV-9999")]), Decimal("120.00"))

    def test_never_negative(self):
        self.assertEqual(refundable_amount(INVOICE, [refund("130.00")]), Decimal("0"))


class IssueRefundTest(unittest.TestCase):
    def test_returns_a_refund_record(self):
        result = issue_refund(INVOICE, [], Decimal("30.00"), "late delivery", date(2024, 5, 20))
        self.assertEqual(result, Refund("INV-1042", Decimal("30.00"), "late delivery", date(2024, 5, 20)))

    def test_allows_refunding_the_exact_remaining_balance(self):
        result = issue_refund(INVOICE, [refund("20.00")], Decimal("100.00"), "cancelled", date(2024, 5, 20))
        self.assertEqual(result.amount, Decimal("100.00"))

    def test_rejects_more_than_the_remaining_balance(self):
        with self.assertRaises(ValueError):
            issue_refund(INVOICE, [refund("20.00")], Decimal("100.01"), "cancelled", date(2024, 5, 20))

    def test_rejects_non_positive_amounts(self):
        for amount in ("0", "-5.00"):
            with self.subTest(amount=amount), self.assertRaises(ValueError):
                issue_refund(INVOICE, [], Decimal(amount), "oops", date(2024, 5, 20))

    def test_only_paid_invoices_can_be_refunded(self):
        open_invoice = Invoice("INV-1043", Decimal("10.00"), "EUR", date(2024, 5, 1), status="open")
        with self.assertRaises(ValueError):
            issue_refund(open_invoice, [], Decimal("5.00"), "oops", date(2024, 5, 2))

    def test_refund_window_is_ninety_days(self):
        issue_refund(INVOICE, [], Decimal("5.00"), "ok", date(2024, 7, 30))
        with self.assertRaises(ValueError):
            issue_refund(INVOICE, [], Decimal("5.00"), "too late", date(2024, 7, 31))


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
