#!/usr/bin/env bash
set -euo pipefail
cat > CONTRIBUTING.md <<'EOF'
# Contributing

- Run the tests with `python3 -m unittest discover -s tests`.
- Lint settings are inherited from the platform standards; do not override them per package.
EOF
cat > README.md <<'EOF'
# parcel-tracking

Part of the logistics monorepo. Shared lint and formatting settings live in
`platform-standards/ruff.toml` at the repository root and are pulled in through `pyproject.toml`.
EOF
cat > pyproject.toml <<'EOF'
[project]
name = "parcel-tracking"
version = "1.8.2"
requires-python = ">=3.9"

[tool.ruff]
extend = "../platform-standards/ruff.toml"
line-length = 110
EOF
mkdir -p tests
cat > tests/test_delays.py <<'EOF'
import unittest
from datetime import date

from tracking.delays import late_shipments
from tracking.models import Shipment

TODAY = date(2024, 6, 20)


def shipment(number, promised, delivered=None, carrier="DHL"):
    return Shipment(number, carrier, promised, delivered)


class LateShipmentsTest(unittest.TestCase):
    def test_returns_undelivered_shipments_past_the_grace_period(self):
        shipments = [shipment("A", date(2024, 6, 10)), shipment("B", date(2024, 6, 19))]
        self.assertEqual([s.tracking_number for s in late_shipments(shipments, TODAY)], ["A"])

    def test_grace_period_is_inclusive(self):
        on_the_edge = shipment("A", date(2024, 6, 19))
        self.assertEqual(late_shipments([on_the_edge], TODAY, grace_days=1), [])
        self.assertEqual(late_shipments([on_the_edge], TODAY, grace_days=0), [on_the_edge])

    def test_delivered_shipments_are_never_late(self):
        delivered = shipment("A", date(2024, 6, 1), delivered=date(2024, 6, 12))
        self.assertEqual(late_shipments([delivered], TODAY), [])

    def test_most_overdue_first_then_tracking_number(self):
        shipments = [
            shipment("C", date(2024, 6, 15)),
            shipment("B", date(2024, 6, 10)),
            shipment("A", date(2024, 6, 15)),
        ]
        self.assertEqual([s.tracking_number for s in late_shipments(shipments, TODAY)], ["B", "A", "C"])

    def test_accepts_any_iterable(self):
        generator = (shipment(str(n), date(2024, 6, n)) for n in (1, 2))
        self.assertEqual(len(late_shipments(generator, TODAY)), 2)

    def test_negative_grace_days_are_rejected(self):
        with self.assertRaises(ValueError):
            late_shipments([], TODAY, grace_days=-1)


if __name__ == "__main__":
    unittest.main()
EOF
mkdir -p tracking
cat > tracking/__init__.py <<'EOF'

EOF
mkdir -p tracking
cat > tracking/delays.py <<'EOF'
from datetime import date
from typing import Iterable, List

from tracking.models import Shipment


def late_shipments(shipments: Iterable[Shipment], today: date, grace_days: int = 1) -> List[Shipment]:
    raise NotImplementedError
EOF
mkdir -p tracking
cat > tracking/models.py <<'EOF'
from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(frozen=True)
class Shipment:
    tracking_number: str
    carrier: str
    promised_on: date
    delivered_on: Optional[date] = None
EOF
mkdir -p tracking
cat > tracking/status.py <<'EOF'
"""Status helpers for individual shipments."""
from datetime import date

from tracking.models import Shipment


def days_overdue(shipment: Shipment, today: date) -> int:
    """Days past the promised date, or 0 if the parcel is on time or delivered."""
    if shipment.delivered_on is not None:
        return 0
    return max(0, (today - shipment.promised_on).days)
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
