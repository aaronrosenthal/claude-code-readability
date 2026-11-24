#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# retention

Reporting queries over the product analytics database (SQLite export).
EOF
mkdir -p retention
cat > retention/__init__.py <<'EOF'

EOF
mkdir -p retention
cat > retention/report.py <<'EOF'
import sqlite3
from typing import List, Tuple


def cohort_retention(
    conn: sqlite3.Connection,
    first_cohort: str,
    last_cohort: str,
    event_name: str,
    max_offset: int = 3,
) -> List[Tuple[str, int, List[int]]]:
    raise NotImplementedError
EOF
mkdir -p retention
cat > retention/schema.py <<'EOF'
import sqlite3

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    signed_up_on TEXT NOT NULL  -- ISO date, YYYY-MM-DD
);

CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    occurred_on TEXT NOT NULL  -- ISO date, YYYY-MM-DD
);

CREATE INDEX events_by_user ON events (user_id, occurred_on);
"""


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
EOF
mkdir -p tests
cat > tests/test_report.py <<'EOF'
import sqlite3
import unittest

from retention.report import cohort_retention
from retention.schema import create_schema


class CohortRetentionTest(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        create_schema(self.conn)

    def tearDown(self):
        self.conn.close()

    def add_user(self, user_id, signed_up_on):
        self.conn.execute(
            "INSERT INTO users (id, email, signed_up_on) VALUES (?, ?, ?)",
            (user_id, f"user{user_id}@example.com", signed_up_on),
        )

    def add_event(self, user_id, occurred_on, name="login"):
        self.conn.execute(
            "INSERT INTO events (user_id, name, occurred_on) VALUES (?, ?, ?)",
            (user_id, name, occurred_on),
        )

    def test_cohort_without_activity(self):
        self.add_user(1, "2024-01-10")
        self.add_user(2, "2024-01-31")
        self.assertEqual(cohort_retention(self.conn, "2024-01", "2024-01", "login"), [("2024-01", 2, [0, 0, 0, 0])])

    def test_counts_distinct_retained_users_per_month_offset(self):
        self.add_user(1, "2024-01-10")
        self.add_user(2, "2024-01-20")
        self.add_user(3, "2024-01-25")
        for day in ("2024-01-11", "2024-01-12", "2024-01-30"):
            self.add_event(1, day)
        self.add_event(1, "2024-02-02")
        self.add_event(2, "2024-02-14")
        self.add_event(2, "2024-02-15")
        self.add_event(2, "2024-04-01")
        self.assertEqual(
            cohort_retention(self.conn, "2024-01", "2024-01", "login"),
            [("2024-01", 3, [1, 2, 0, 1])],
        )

    def test_offsets_cross_year_boundaries(self):
        self.add_user(1, "2023-11-05")
        self.add_event(1, "2024-01-09")
        self.assertEqual(
            cohort_retention(self.conn, "2023-11", "2023-11", "login", max_offset=2),
            [("2023-11", 1, [0, 0, 1])],
        )

    def test_only_the_requested_event_counts(self):
        self.add_user(1, "2024-03-01")
        self.add_event(1, "2024-03-02", name="purchase")
        self.assertEqual(cohort_retention(self.conn, "2024-03", "2024-03", "login", max_offset=1), [("2024-03", 1, [0, 0])])
        self.assertEqual(cohort_retention(self.conn, "2024-03", "2024-03", "purchase", max_offset=1), [("2024-03", 1, [1, 0])])

    def test_cohort_range_is_inclusive_and_sorted(self):
        for user_id, day in enumerate(["2024-01-15", "2024-02-15", "2024-03-15", "2024-04-15"], start=1):
            self.add_user(user_id, day)
        rows = cohort_retention(self.conn, "2024-02", "2024-03", "login", max_offset=0)
        self.assertEqual(rows, [("2024-02", 1, [0]), ("2024-03", 1, [0])])

    def test_ignores_activity_before_signup_and_beyond_max_offset(self):
        self.add_user(1, "2024-05-10")
        self.add_event(1, "2024-04-30")
        self.add_event(1, "2024-09-01")
        self.assertEqual(cohort_retention(self.conn, "2024-05", "2024-05", "login", max_offset=2), [("2024-05", 1, [0, 0, 0])])

    def test_event_name_is_bound_as_a_parameter(self):
        self.add_user(1, "2024-01-10")
        self.add_event(1, "2024-01-11")
        hostile = "login' OR '1'='1"
        self.assertEqual(cohort_retention(self.conn, "2024-01", "2024-01", hostile, max_offset=0), [("2024-01", 1, [0])])


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
