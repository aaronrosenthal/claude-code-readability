import argparse
import sys
from datetime import date, datetime
from typing import Iterable, List, NamedTuple, Optional, TextIO

LEVELS = ("DEBUG", "INFO", "WARN", "ERROR")


class Entry(NamedTuple):
    timestamp: datetime
    level: str
    service: str
    message: str


def parse_line(line: str) -> Entry:
    stamp, level, service, message = line.rstrip("\n").split(" ", 3)
    return Entry(datetime.fromisoformat(stamp), level, service, message)


def read_entries(lines: Iterable[str]) -> List[Entry]:
    return [parse_line(line) for line in lines if line.strip()]


def filter_entries(
    entries: Iterable[Entry],
    level: Optional[str] = None,
    service: Optional[str] = None,
    since: Optional[date] = None,
) -> List[Entry]:
    min_rank = LEVELS.index(level) if level else 0
    result = []
    for entry in entries:
        if LEVELS.index(entry.level) < min_rank:
            continue
        if service and entry.service != service:
            continue
        if since and entry.timestamp.date() < since:
            continue
        result.append(entry)
    return result


def parse_date(text: str) -> date:
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        raise argparse.ArgumentTypeError(f"not a valid YYYY-MM-DD date: {text!r}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="deploylog", description="Show deploy log entries.")
    parser.add_argument("path", help="log file to read")
    parser.add_argument("--level", choices=LEVELS, help="minimum level to show")
    parser.add_argument("--service", help="only show this service")
    parser.add_argument("--since", type=parse_date, help="only show entries on or after this date (YYYY-MM-DD)")
    return parser


def main(argv: Optional[List[str]] = None, out: Optional[TextIO] = None) -> int:
    args = build_parser().parse_args(argv)
    out = out or sys.stdout
    with open(args.path) as handle:
        entries = read_entries(handle)
    for entry in filter_entries(entries, args.level, args.service, args.since):
        out.write(f"{entry.timestamp:%Y-%m-%d %H:%M} {entry.level:<5} {entry.service}: {entry.message}\n")
    return 0
