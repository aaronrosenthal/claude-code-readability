import threading
import time
from collections import defaultdict, deque
from typing import Callable, Deque, Dict


class SlidingWindowCounter:
    def __init__(self, window_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self._window_seconds = window_seconds
        self._clock = clock
        self._events: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> int:
        with self._lock:
            now = self._clock()
            events = self._live_events(key, now)
            events.append(now)
            return len(events)

    def count(self, key: str) -> int:
        with self._lock:
            return len(self._live_events(key, self._clock()))

    def allow(self, key: str, limit: int) -> bool:
        with self._lock:
            now = self._clock()
            events = self._live_events(key, now)
            if len(events) >= limit:
                return False
            events.append(now)
            return True

    def _live_events(self, key: str, now: float) -> Deque[float]:
        events = self._events[key]
        cutoff = now - self._window_seconds
        while events and events[0] <= cutoff:
            events.popleft()
        return events
