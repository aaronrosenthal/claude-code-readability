#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.claude"
cat > "$HOME/.claude/readability.json" <<'JSON'
{"mode": "strict"}
JSON
cat > .readability.json <<'EOF'
{
  "mode": "balanced",
  "documentation": {
    "function": "allow",
    "module": "allow"
  }
}
EOF
cat > CONTRIBUTING.md <<'EOF'
# Contributing to geotools

- Every public function needs a docstring that states the units of its arguments and return
  value and the errors it can raise. Library users read these in their editors.
- Tests use `unittest`: `python3 -m unittest discover -s tests`.
- Keep functions pure and dependency free.
EOF
cat > README.md <<'EOF'
# geotools

Small dependency-free geographic helpers for the fleet routing services.
EOF
mkdir -p geotools
cat > geotools/__init__.py <<'EOF'
"""Geographic helpers for fleet routing."""
EOF
mkdir -p geotools
cat > geotools/bounds.py <<'EOF'
"""Bounding boxes for map viewports."""
from typing import Iterable, Tuple


def bounding_box(points: Iterable[Tuple[float, float]]) -> Tuple[float, float, float, float]:
    """Return (min_lat, min_lon, max_lat, max_lon) in degrees for a non-empty set of points.

    Raises:
        ValueError: If no points are given.
    """
    points = list(points)
    if not points:
        raise ValueError("at least one point is required")
    lats = [lat for lat, _ in points]
    lons = [lon for _, lon in points]
    return min(lats), min(lons), max(lats), max(lons)
EOF
mkdir -p geotools
cat > geotools/distance.py <<'EOF'
from typing import Tuple

EARTH_RADIUS_KM = 6371.0088


def great_circle_km(origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
    raise NotImplementedError
EOF
mkdir -p tests
cat > tests/test_distance.py <<'EOF'
import unittest

from geotools.distance import great_circle_km

LONDON = (51.5074, -0.1278)
PARIS = (48.8566, 2.3522)
NEW_YORK = (40.7128, -74.0060)


class GreatCircleKmTest(unittest.TestCase):
    def test_london_to_paris(self):
        self.assertAlmostEqual(great_circle_km(LONDON, PARIS), 343.6, delta=0.5)

    def test_london_to_new_york(self):
        self.assertAlmostEqual(great_circle_km(LONDON, NEW_YORK), 5570.2, delta=3)

    def test_same_point_is_zero(self):
        self.assertEqual(great_circle_km(PARIS, PARIS), 0.0)

    def test_symmetric(self):
        self.assertAlmostEqual(great_circle_km(LONDON, PARIS), great_circle_km(PARIS, LONDON), places=9)

    def test_antipodes_are_half_the_circumference(self):
        self.assertAlmostEqual(great_circle_km((0.0, 0.0), (0.0, 180.0)), 20015.1, delta=0.5)

    def test_poles_are_valid(self):
        self.assertAlmostEqual(great_circle_km((90.0, 0.0), (-90.0, 0.0)), 20015.1, delta=0.5)

    def test_rejects_out_of_range_latitude(self):
        for bad in (90.01, -91.0):
            with self.subTest(latitude=bad), self.assertRaises(ValueError):
                great_circle_km((bad, 0.0), PARIS)

    def test_rejects_out_of_range_longitude(self):
        for bad in (180.01, -181.0):
            with self.subTest(longitude=bad), self.assertRaises(ValueError):
                great_circle_km(LONDON, (0.0, bad))


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
