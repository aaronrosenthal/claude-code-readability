"""Refund eligibility and issuing for paid invoices."""
from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable

from billing.models import Invoice, Refund

REFUND_WINDOW = timedelta(days=90)


def refundable_amount(invoice: Invoice, prior_refunds: Iterable[Refund]) -> Decimal:
    """Return how much of an invoice can still be refunded.

    Args:
        invoice: The invoice being refunded.
        prior_refunds: Refunds already issued; those for other invoices are ignored.

    Returns:
        The invoice total minus earlier refunds, in the invoice currency and never below zero.
    """
    amounts = (r.amount for r in prior_refunds if r.invoice_number == invoice.number)
    refunded = sum(amounts, Decimal("0"))
    return max(Decimal("0"), invoice.total - refunded)


def issue_refund(
    invoice: Invoice,
    prior_refunds: Iterable[Refund],
    amount: Decimal,
    reason: str,
    issued_on: date,
) -> Refund:
    """Create a refund against a paid invoice.

    Args:
        invoice: The invoice being refunded.
        prior_refunds: Refunds already issued for this customer.
        amount: Amount to return, in the invoice currency.
        reason: Free-text reason recorded with the refund.
        issued_on: Date the refund is issued.

    Returns:
        The new refund record.

    Raises:
        ValueError: If the invoice is not paid, the amount is not positive or exceeds the
            refundable balance, or the refund is issued more than 90 days after the invoice.
    """
    if invoice.status != "paid":
        raise ValueError(f"invoice {invoice.number} is not paid")
    if amount <= 0:
        raise ValueError("refund amount must be positive")
    if amount > refundable_amount(invoice, prior_refunds):
        raise ValueError(f"refund exceeds the refundable balance of invoice {invoice.number}")
    if issued_on - invoice.issued_on > REFUND_WINDOW:
        raise ValueError(f"invoice {invoice.number} is outside the refund window")
    return Refund(invoice.number, amount, reason, issued_on)
