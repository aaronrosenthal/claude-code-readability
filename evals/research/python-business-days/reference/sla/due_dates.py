from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, tzinfo
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
    cursor = _first_working_moment(opened_at.astimezone(hours.tz), hours)
    remaining = sla
    while True:
        time_left_today = _at(cursor.date(), hours.closes, hours.tz) - cursor
        if remaining <= time_left_today:
            return cursor + remaining
        remaining -= time_left_today
        cursor = _opening_on_or_after(cursor.date() + timedelta(days=1), hours)


def _first_working_moment(moment: datetime, hours: BusinessHours) -> datetime:
    opening = _at(moment.date(), hours.opens, hours.tz)
    closing = _at(moment.date(), hours.closes, hours.tz)
    if hours.is_business_day(moment.date()):
        if moment < opening:
            return opening
        if moment < closing:
            return moment
    return _opening_on_or_after(moment.date() + timedelta(days=1), hours)


def _opening_on_or_after(day: date, hours: BusinessHours) -> datetime:
    while not hours.is_business_day(day):
        day += timedelta(days=1)
    return _at(day, hours.opens, hours.tz)


def _at(day: date, clock: time, tz: tzinfo) -> datetime:
    return datetime.combine(day, clock, tzinfo=tz)
