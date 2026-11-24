#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# sla

Due-date calculation for support tickets. Support is staffed on business days only.
EOF
mkdir -p sla
cat > sla/__init__.py <<'EOF'

EOF
mkdir -p sla
cat > sla/due_dates.py <<'EOF'
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import FrozenSet
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class BusinessHours:
    tz: ZoneInfo
    opens: time = time(9, 0)
    closes: time = time(17, 0)
    holidays: FrozenSet[date] = field(default_factory=frozenset)

    def is_business_day(self, day: date) -> bool:
        return day.weekday() < 5 and day not in self.holidays


def due_at(opened_at: datetime, sla: timedelta, hours: BusinessHours) -> datetime:
    raise NotImplementedError
EOF
mkdir -p tests
cat > tests/test_due_dates.py <<'EOF'
import unittest
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sla.due_dates import BusinessHours, due_at

NY = ZoneInfo("America/New_York")
HOURS = BusinessHours(NY, holidays=frozenset({date(2024, 7, 4), date(2024, 12, 25), date(2024, 12, 26)}))


def ny(year, month, day, hour=0, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=NY)


def hours(n):
    return timedelta(hours=n)


class DueAtTest(unittest.TestCase):
    def test_within_the_same_business_day(self):
        self.assertEqual(due_at(ny(2024, 5, 14, 10), hours(3), HOURS), ny(2024, 5, 14, 13))

    def test_finishing_exactly_at_closing_time_stays_on_the_same_day(self):
        self.assertEqual(due_at(ny(2024, 5, 14, 13), hours(4), HOURS), ny(2024, 5, 14, 17))

    def test_rolls_over_to_the_next_morning(self):
        self.assertEqual(due_at(ny(2024, 5, 14, 15), hours(4), HOURS), ny(2024, 5, 15, 11))

    def test_ticket_opened_before_opening_starts_at_opening(self):
        self.assertEqual(due_at(ny(2024, 5, 14, 6, 30), hours(2), HOURS), ny(2024, 5, 14, 11))

    def test_ticket_opened_after_closing_starts_next_business_day(self):
        self.assertEqual(due_at(ny(2024, 5, 14, 17), hours(1), HOURS), ny(2024, 5, 15, 10))
        self.assertEqual(due_at(ny(2024, 5, 14, 22, 15), hours(1), HOURS), ny(2024, 5, 15, 10))

    def test_weekend_is_skipped(self):
        self.assertEqual(due_at(ny(2024, 5, 17, 16), hours(2), HOURS), ny(2024, 5, 20, 10))
        self.assertEqual(due_at(ny(2024, 5, 18, 12), hours(1), HOURS), ny(2024, 5, 20, 10))

    def test_multi_day_sla(self):
        self.assertEqual(due_at(ny(2024, 5, 14, 9), hours(24), HOURS), ny(2024, 5, 16, 17))
        self.assertEqual(due_at(ny(2024, 5, 14, 9), hours(25), HOURS), ny(2024, 5, 17, 10))

    def test_holiday_is_skipped(self):
        self.assertEqual(due_at(ny(2024, 7, 3, 16), hours(2), HOURS), ny(2024, 7, 5, 10))

    def test_consecutive_holidays_are_skipped(self):
        self.assertEqual(due_at(ny(2024, 12, 24, 16), hours(2), HOURS), ny(2024, 12, 27, 10))
        self.assertEqual(due_at(ny(2024, 12, 24, 16), hours(1), HOURS), ny(2024, 12, 24, 17))

    def test_zero_sla_is_due_when_the_team_next_opens(self):
        self.assertEqual(due_at(ny(2024, 5, 14, 11), timedelta(0), HOURS), ny(2024, 5, 14, 11))
        self.assertEqual(due_at(ny(2024, 5, 18, 11), timedelta(0), HOURS), ny(2024, 5, 20, 9))

    def test_opened_at_in_another_timezone_is_converted_first(self):
        opened = datetime(2024, 5, 14, 19, 0, tzinfo=timezone.utc)  # 15:00 in New York
        due = due_at(opened, hours(4), HOURS)
        self.assertEqual(due, ny(2024, 5, 15, 11))
        self.assertEqual(due.utcoffset(), timedelta(hours=-4))

    def test_result_keeps_wall_clock_hours_across_a_daylight_saving_change(self):
        due = due_at(ny(2024, 3, 8, 16), hours(4), HOURS)
        self.assertEqual(due, ny(2024, 3, 11, 12))
        self.assertEqual((due.hour, due.utcoffset()), (12, timedelta(hours=-4)))

    def test_custom_hours_and_zone(self):
        london = BusinessHours(ZoneInfo("Europe/London"), opens=time(8, 30), closes=time(16, 30))
        opened = datetime(2024, 5, 17, 15, 30, tzinfo=ZoneInfo("Europe/London"))
        self.assertEqual(
            due_at(opened, timedelta(hours=2), london),
            datetime(2024, 5, 20, 9, 30, tzinfo=ZoneInfo("Europe/London")),
        )


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
