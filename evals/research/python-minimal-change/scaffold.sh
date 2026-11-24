#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# deploylog

Small command line viewer for the deploy logs we collect from the build servers.

    python3 -m deploylog.cli deploys.log --level WARN --service payments
EOF
mkdir -p deploylog
cat > deploylog/__init__.py <<'EOF'

EOF
mkdir -p deploylog
cat > deploylog/__main__.py <<'EOF'
import sys

from deploylog.cli import main

sys.exit(main())
EOF
mkdir -p deploylog
cat > deploylog/cli.py <<'EOF'
import argparse
import sys
from datetime import datetime
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


def filter_entries(entries: Iterable[Entry], level: Optional[str] = None, service: Optional[str] = None) -> List[Entry]:
    min_rank = LEVELS.index(level) if level else 0
    result = []
    for entry in entries:
        if LEVELS.index(entry.level) < min_rank:
            continue
        if service and entry.service != service:
            continue
        result.append(entry)
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="deploylog", description="Show deploy log entries.")
    parser.add_argument("path", help="log file to read")
    parser.add_argument("--level", choices=LEVELS, help="minimum level to show")
    parser.add_argument("--service", help="only show this service")
    return parser


def main(argv: Optional[List[str]] = None, out: Optional[TextIO] = None) -> int:
    args = build_parser().parse_args(argv)
    out = out or sys.stdout
    with open(args.path) as handle:
        entries = read_entries(handle)
    for entry in filter_entries(entries, args.level, args.service):
        out.write(f"{entry.timestamp:%Y-%m-%d %H:%M} {entry.level:<5} {entry.service}: {entry.message}\n")
    return 0
EOF
mkdir -p tests
cat > tests/test_cli.py <<'EOF'
import io
import os
import tempfile
import unittest
from datetime import date, datetime

from deploylog import cli

LOG = """\
2024-03-04T23:59:30 INFO payments deploy finished
2024-03-05T00:00:00 ERROR payments rollback started
2024-03-05T10:15:00 WARN search slow index build
2024-03-06T08:00:00 INFO payments deploy finished
"""


def entries():
    return cli.read_entries(LOG.splitlines())


class CliTest(unittest.TestCase):
    def test_parse_line(self):
        entry = cli.parse_line("2024-03-05T10:15:00 WARN search slow index build\n")
        self.assertEqual(entry, cli.Entry(datetime(2024, 3, 5, 10, 15), "WARN", "search", "slow index build"))

    def test_filter_by_level(self):
        levels = [e.level for e in cli.filter_entries(entries(), level="WARN")]
        self.assertEqual(levels, ["ERROR", "WARN"])

    def test_filter_by_service(self):
        services = {e.service for e in cli.filter_entries(entries(), service="search")}
        self.assertEqual(services, {"search"})

    def test_parser_defaults(self):
        args = cli.build_parser().parse_args(["deploys.log"])
        self.assertEqual((args.level, args.service, args.since), (None, None, None))

    def test_main_prints_filtered_entries(self):
        out = self.run_main(["--level", "ERROR"])
        self.assertEqual(out, "2024-03-05 00:00 ERROR payments: rollback started\n")

    def test_filter_since_is_inclusive_of_the_whole_day(self):
        found = cli.filter_entries(entries(), since=date(2024, 3, 5))
        self.assertEqual([e.timestamp.day for e in found], [5, 5, 6])

    def test_filter_since_combines_with_other_filters(self):
        found = cli.filter_entries(entries(), level="INFO", service="payments", since=date(2024, 3, 6))
        self.assertEqual([e.timestamp.day for e in found], [6])

    def test_parser_reads_since_as_a_date(self):
        args = cli.build_parser().parse_args(["deploys.log", "--since", "2024-03-05"])
        self.assertEqual(args.since, date(2024, 3, 5))

    def test_parser_rejects_a_bad_since_date(self):
        with self.assertRaises(SystemExit) as raised:
            cli.build_parser().parse_args(["deploys.log", "--since", "05/03/2024"])
        self.assertEqual(raised.exception.code, 2)

    def test_main_applies_since(self):
        out = self.run_main(["--since", "2024-03-06"])
        self.assertEqual(out, "2024-03-06 08:00 INFO  payments: deploy finished\n")

    def run_main(self, extra_args):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "deploys.log")
            with open(path, "w") as handle:
                handle.write(LOG)
            out = io.StringIO()
            self.assertEqual(cli.main([path] + extra_args, out), 0)
            return out.getvalue()


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
