#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# stockcheck

Looks up the stock of a SKU across the inventory services (own warehouses, 3PL partners, marketplace
fulfilment). Each service is an object with `name`, `priority` (lower number wins) and an async
`stock_levels(sku)` method returning `{location: quantity}`.
EOF
mkdir -p stockcheck
cat > stockcheck/__init__.py <<'EOF'

EOF
mkdir -p stockcheck
cat > stockcheck/aggregate.py <<'EOF'
from dataclasses import dataclass, field
from typing import Dict, Sequence


@dataclass
class StockReport:
    levels: Dict[str, int] = field(default_factory=dict)
    failures: Dict[str, str] = field(default_factory=dict)


async def check_stock(sku: str, services: Sequence, timeout: float) -> StockReport:
    raise NotImplementedError
EOF
mkdir -p tests
cat > tests/test_aggregate.py <<'EOF'
import asyncio
import unittest

from stockcheck.aggregate import StockReport, check_stock


class FakeService:
    def __init__(self, name, priority, levels=None, error=None, delay=0.0):
        self.name = name
        self.priority = priority
        self.levels = levels or {}
        self.error = error
        self.delay = delay
        self.calls = []

    async def stock_levels(self, sku):
        self.calls.append(sku)
        await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return dict(self.levels)


class GatedService(FakeService):
    def __init__(self, gate, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.gate = gate

    async def stock_levels(self, sku):
        await self.gate.arrive()
        return await super().stock_levels(sku)


class Gate:
    """Lets calls through only once `parties` of them are waiting at the same time."""

    def __init__(self, parties):
        self.parties = parties
        self.waiting = 0
        self.open = asyncio.Event()

    async def arrive(self):
        self.waiting += 1
        if self.waiting == self.parties:
            self.open.set()
        await self.open.wait()


class CheckStockTest(unittest.IsolatedAsyncioTestCase):
    async def test_merges_locations_from_all_services(self):
        services = [
            FakeService("own", 1, {"east": 5}),
            FakeService("3pl", 2, {"west": 3}),
        ]
        report = await check_stock("SKU-1", services, timeout=1)
        self.assertEqual(report, StockReport({"east": 5, "west": 3}, {}))
        self.assertEqual(services[0].calls, ["SKU-1"])

    async def test_lower_priority_number_wins_conflicts(self):
        services = [
            FakeService("marketplace", 3, {"east": 1, "south": 7}),
            FakeService("own", 1, {"east": 9}),
            FakeService("3pl", 2, {"east": 4, "west": 2}),
        ]
        report = await check_stock("SKU-1", services, timeout=1)
        self.assertEqual(report.levels, {"east": 9, "west": 2, "south": 7})

    async def test_equal_priorities_prefer_the_earlier_service(self):
        services = [FakeService("a", 1, {"east": 1}), FakeService("b", 1, {"east": 2})]
        report = await check_stock("SKU-1", services, timeout=1)
        self.assertEqual(report.levels, {"east": 1})

    async def test_services_are_queried_concurrently(self):
        gate = Gate(parties=3)
        services = [GatedService(gate, f"svc{i}", i, {f"loc{i}": i}) for i in range(3)]
        report = await check_stock("SKU-1", services, timeout=1)
        self.assertEqual(report.failures, {})
        self.assertEqual(report.levels, {"loc0": 0, "loc1": 1, "loc2": 2})

    async def test_failures_are_collected_without_hiding_other_results(self):
        services = [
            FakeService("own", 1, {"east": 5}),
            FakeService("3pl", 2, error=ConnectionError("refused")),
        ]
        report = await check_stock("SKU-1", services, timeout=1)
        self.assertEqual(report.levels, {"east": 5})
        self.assertEqual(report.failures, {"3pl": "ConnectionError: refused"})

    async def test_slow_service_times_out_individually(self):
        services = [
            FakeService("own", 1, {"east": 5}),
            FakeService("slow", 2, {"east": 99, "west": 1}, delay=30),
        ]
        report = await check_stock("SKU-1", services, timeout=0.05)
        self.assertEqual(report.levels, {"east": 5})
        self.assertEqual(report.failures, {"slow": "timeout"})

    async def test_all_services_failing_returns_empty_levels(self):
        services = [FakeService("a", 1, error=ValueError("bad")), FakeService("b", 2, error=KeyError("x"))]
        report = await check_stock("SKU-1", services, timeout=1)
        self.assertEqual(report.levels, {})
        self.assertEqual(set(report.failures), {"a", "b"})

    async def test_no_services(self):
        self.assertEqual(await check_stock("SKU-1", [], timeout=1), StockReport())


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
