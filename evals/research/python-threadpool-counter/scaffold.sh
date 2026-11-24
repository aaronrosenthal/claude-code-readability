#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# ratelimit

In-process request counters for the API gateway workers. Handlers run on a thread pool, so every
counter is shared between threads.
EOF
mkdir -p ratelimit
cat > ratelimit/__init__.py <<'EOF'

EOF
mkdir -p ratelimit
cat > ratelimit/window.py <<'EOF'
import time
from typing import Callable


class SlidingWindowCounter:
    def __init__(self, window_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        raise NotImplementedError

    def hit(self, key: str) -> int:
        raise NotImplementedError

    def count(self, key: str) -> int:
        raise NotImplementedError

    def allow(self, key: str, limit: int) -> bool:
        raise NotImplementedError
EOF
mkdir -p tests
cat > tests/test_window.py <<'EOF'
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor

from ratelimit.window import SlidingWindowCounter


class FakeClock:
    def __init__(self, now=1000.0):
        self.now = now

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class SlidingWindowCounterTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.counter = SlidingWindowCounter(10, clock=self.clock)

    def test_hit_returns_events_in_the_window(self):
        self.assertEqual([self.counter.hit("a") for _ in range(3)], [1, 2, 3])
        self.assertEqual(self.counter.count("a"), 3)

    def test_events_expire_after_the_window(self):
        self.counter.hit("a")
        self.clock.advance(6)
        self.counter.hit("a")
        self.clock.advance(5)
        self.assertEqual(self.counter.count("a"), 1)

    def test_event_exactly_one_window_old_has_expired(self):
        self.counter.hit("a")
        self.clock.advance(10)
        self.assertEqual(self.counter.count("a"), 0)

    def test_keys_are_independent(self):
        self.counter.hit("a")
        self.counter.hit("a")
        self.counter.hit("b")
        self.assertEqual((self.counter.count("a"), self.counter.count("b"), self.counter.count("c")), (2, 1, 0))

    def test_allow_stops_at_the_limit_and_does_not_record_rejections(self):
        self.assertEqual([self.counter.allow("a", 3) for _ in range(5)], [True, True, True, False, False])
        self.assertEqual(self.counter.count("a"), 3)
        self.clock.advance(10)
        self.assertTrue(self.counter.allow("a", 3))

    def test_default_clock_is_monotonic_time(self):
        counter = SlidingWindowCounter(60)
        counter.hit("a")
        self.assertEqual(counter.count("a"), 1)


class SlidingWindowCounterThreadingTest(unittest.TestCase):
    def setUp(self):
        self.original_interval = sys.getswitchinterval()
        sys.setswitchinterval(1e-6)
        self.counter = SlidingWindowCounter(3600, clock=FakeClock())

    def tearDown(self):
        sys.setswitchinterval(self.original_interval)

    def run_in_threads(self, task, workers=16, repeats=500):
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(lambda: [task() for _ in range(repeats)]) for _ in range(workers)]
            return [result for future in futures for result in future.result()]

    def test_concurrent_hits_are_all_counted_exactly_once(self):
        results = self.run_in_threads(lambda: self.counter.hit("shared"))
        self.assertEqual(sorted(results), list(range(1, 16 * 500 + 1)))
        self.assertEqual(self.counter.count("shared"), 16 * 500)

    def test_concurrent_allow_never_exceeds_the_limit(self):
        results = self.run_in_threads(lambda: self.counter.allow("shared", 1000))
        self.assertEqual(results.count(True), 1000)
        self.assertEqual(self.counter.count("shared"), 1000)

    def test_concurrent_use_of_many_keys(self):
        keys = [f"user-{n}" for n in range(8)]
        results = self.run_in_threads(lambda: [self.counter.hit(key) for key in keys])
        self.assertEqual(len(results), 16 * 500)
        for key in keys:
            self.assertEqual(self.counter.count(key), 16 * 500)


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
