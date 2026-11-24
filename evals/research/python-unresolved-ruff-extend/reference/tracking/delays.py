from datetime import date
from typing import Iterable, List

from tracking.models import Shipment
from tracking.status import days_overdue


def late_shipments(shipments: Iterable[Shipment], today: date, grace_days: int = 1) -> List[Shipment]:
    if grace_days < 0:
        raise ValueError("grace_days must not be negative")
    late = [s for s in shipments if days_overdue(s, today) > grace_days]
    return sorted(late, key=lambda s: (-days_overdue(s, today), s.tracking_number))
