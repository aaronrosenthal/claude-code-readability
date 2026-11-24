"""Stock level calculations and movements for the regional warehouses."""
from collections import defaultdict


def _normalise_sku(sku):
    return sku.strip().upper()


def reorder_quantity(on_hand, daily_demand, lead_time_days, safety_stock=0):
    """Return how many units to order so stock lasts through the supplier lead time.

    The result is never negative; it is 0 when current stock already covers the
    expected demand plus the safety stock.
    """
    expected = daily_demand * lead_time_days + safety_stock
    return max(0, expected - on_hand)


def low_stock_skus(levels, thresholds):
    """Return the normalised SKUs whose quantity is below their reorder threshold.

    SKUs without a threshold are never reported.
    """
    return sorted(
        _normalise_sku(sku)
        for sku, quantity in levels.items()
        if quantity < thresholds.get(sku, 0)
    )


def apply_movements(levels, movements):
    """Return new stock levels after applying (sku, delta) movements in order.

    The input mapping is not modified.

    Raises:
        ValueError: If a movement would take a SKU's stock below zero.
    """
    updated = dict(levels)
    for sku, delta in movements:
        updated[sku] = updated.get(sku, 0) + delta
        if updated[sku] < 0:
            raise ValueError(f"stock for {sku} would go negative")
    return updated


def total_by_warehouse(rows):
    """Sum quantities per warehouse from (warehouse, sku, quantity) rows."""
    totals = defaultdict(int)
    for warehouse, _sku, quantity in rows:
        totals[warehouse] += quantity
    return dict(totals)
