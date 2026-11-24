import sqlite3
from typing import List, Tuple

COHORT_SIZES_SQL = """
SELECT strftime('%Y-%m', signed_up_on) AS cohort, COUNT(*) AS size
FROM users
WHERE cohort BETWEEN :first_cohort AND :last_cohort
GROUP BY cohort
ORDER BY cohort
"""

RETAINED_USERS_SQL = """
WITH activity AS (
    SELECT
        strftime('%Y-%m', u.signed_up_on) AS cohort,
        u.id AS user_id,
        (CAST(strftime('%Y', e.occurred_on) AS INTEGER) - CAST(strftime('%Y', u.signed_up_on) AS INTEGER)) * 12
        + CAST(strftime('%m', e.occurred_on) AS INTEGER) - CAST(strftime('%m', u.signed_up_on) AS INTEGER)
            AS month_offset
    FROM users AS u
    JOIN events AS e ON e.user_id = u.id
    WHERE e.name = :event_name
)
SELECT cohort, month_offset, COUNT(DISTINCT user_id)
FROM activity
WHERE cohort BETWEEN :first_cohort AND :last_cohort
  AND month_offset BETWEEN 0 AND :max_offset
GROUP BY cohort, month_offset
"""


def cohort_retention(
    conn: sqlite3.Connection,
    first_cohort: str,
    last_cohort: str,
    event_name: str,
    max_offset: int = 3,
) -> List[Tuple[str, int, List[int]]]:
    params = {
        "first_cohort": first_cohort,
        "last_cohort": last_cohort,
        "event_name": event_name,
        "max_offset": max_offset,
    }
    retained = {
        (cohort, offset): users
        for cohort, offset, users in conn.execute(RETAINED_USERS_SQL, params)
    }
    return [
        (cohort, size, [retained.get((cohort, offset), 0) for offset in range(max_offset + 1)])
        for cohort, size in conn.execute(COHORT_SIZES_SQL, params)
    ]
