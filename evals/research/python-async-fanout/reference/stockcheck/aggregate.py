import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional, Sequence, Tuple


@dataclass
class StockReport:
    levels: Dict[str, int] = field(default_factory=dict)
    failures: Dict[str, str] = field(default_factory=dict)


async def check_stock(sku: str, services: Sequence, timeout: float) -> StockReport:
    outcomes = await asyncio.gather(*(_query(service, sku, timeout) for service in services))

    report = StockReport()
    by_priority = sorted(zip(services, outcomes), key=lambda pair: pair[0].priority)
    for service, (levels, failure) in by_priority:
        if failure:
            report.failures[service.name] = failure
        for location, quantity in levels.items():
            report.levels.setdefault(location, quantity)
    return report


async def _query(service, sku: str, timeout: float) -> Tuple[Dict[str, int], Optional[str]]:
    try:
        return await asyncio.wait_for(service.stock_levels(sku), timeout), None
    except asyncio.TimeoutError:
        return {}, "timeout"
    except Exception as exc:
        return {}, f"{type(exc).__name__}: {exc}"
