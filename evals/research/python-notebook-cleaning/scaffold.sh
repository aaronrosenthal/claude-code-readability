#!/usr/bin/env bash
set -euo pipefail
cat > check_notebook.py <<'EOF'
import json
import sys
from decimal import Decimal

NOTEBOOK = "orders_cleaning.ipynb"
CHECKS = []


def check(function):
    CHECKS.append(function)
    return function


def run_notebook(path):
    with open(path) as handle:
        notebook = json.load(handle)
    namespace = {"__name__": "__notebook__"}
    code_cells = [cell for cell in notebook["cells"] if cell["cell_type"] == "code"]
    for number, cell in enumerate(code_cells, start=1):
        source = "".join(cell["source"])
        exec(compile(source, f"{path}[code cell {number}]", "exec"), namespace)
    return namespace


@check
def keeps_one_row_per_order(ns):
    assert [o["order_id"] for o in ns["clean_orders"]] == ["A100", "A101", "A103"], ns["clean_orders"]


@check
def keeps_the_most_recent_version_of_an_order(ns):
    a100 = ns["clean_orders"][0]
    assert a100["updated"] == "2024-05-03" and a100["amount"] == Decimal("1300.00"), a100


@check
def parses_amounts_with_symbols_and_thousands_separators(ns):
    amounts = {o["order_id"]: o["amount"] for o in ns["clean_orders"]}
    assert amounts == {"A100": Decimal("1300.00"), "A101": Decimal("89.90"), "A103": Decimal("45.50")}, amounts


@check
def drops_orders_without_an_amount(ns):
    ids = {o["order_id"] for o in ns["clean_orders"]}
    assert not ids & {"A102", "A104"}, ids


@check
def normalises_emails_and_countries(ns):
    emails = [o["email"] for o in ns["clean_orders"]]
    countries = [o["country"] for o in ns["clean_orders"]]
    assert emails == ["ana@example.com", "ben@example.com", "cara@example.com"], emails
    assert countries == ["US", "DE", "GB"], countries


@check
def does_not_modify_the_raw_data(ns):
    assert len(ns["raw_orders"]) == 6 and ns["raw_orders"][2]["email"] == " Ana@Example.com "


@check
def summarises_revenue_by_country(ns):
    expected = {"US": Decimal("1300.00"), "DE": Decimal("89.90"), "GB": Decimal("45.50")}
    assert ns["revenue_by_country"] == expected, ns["revenue_by_country"]


def main():
    namespace = run_notebook(NOTEBOOK)
    for function in CHECKS:
        function(namespace)
        print(f"ok: {function.__name__}")
    print(f"ALL {len(CHECKS)} CHECKS PASSED")


if __name__ == "__main__":
    sys.exit(main())
EOF
cat > orders_cleaning.ipynb <<'EOF'
{
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# Order cleaning\n",
    "\n",
    "Cleans the raw shop export before the weekly revenue report. Run the cells top to bottom."
   ]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": [
    "raw_orders = [\n",
    "    {\"order_id\": \"A100\", \"email\": \"ana@example.com\", \"amount\": \"$1,300.00\", \"country\": \"us\", \"updated\": \"2024-05-03\"},\n",
    "    {\"order_id\": \"A101\", \"email\": \"ben@example.com\", \"amount\": \"89.90\", \"country\": \"DE\", \"updated\": \"2024-05-02\"},\n",
    "    {\"order_id\": \"A100\", \"email\": \" Ana@Example.com \", \"amount\": \"$1,250.00\", \"country\": \"US\", \"updated\": \"2024-05-01\"},\n",
    "    {\"order_id\": \"A102\", \"email\": \"dev@example.com\", \"amount\": \"\", \"country\": \"FR\", \"updated\": \"2024-05-02\"},\n",
    "    {\"order_id\": \"A103\", \"email\": \"  Cara@Example.com\", \"amount\": \"45.5\", \"country\": \"gb\", \"updated\": \"2024-05-04\"},\n",
    "    {\"order_id\": \"A104\", \"email\": \"eli@example.com\", \"amount\": None, \"country\": \"DE\", \"updated\": \"2024-05-04\"},\n",
    "]"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Clean"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": [
    "from decimal import Decimal\n",
    "\n",
    "\n",
    "def parse_amount(text):\n",
    "    return Decimal(text.replace(\"$\", \"\"))\n",
    "\n",
    "\n",
    "latest = {}\n",
    "for row in raw_orders:\n",
    "    if not row[\"amount\"]:\n",
    "        continue\n",
    "    latest[row[\"order_id\"]] = {\n",
    "        \"order_id\": row[\"order_id\"],\n",
    "        \"email\": row[\"email\"].strip().lower(),\n",
    "        \"amount\": parse_amount(row[\"amount\"]),\n",
    "        \"country\": row[\"country\"].upper(),\n",
    "        \"updated\": row[\"updated\"],\n",
    "    }\n",
    "\n",
    "clean_orders = sorted(latest.values(), key=lambda order: order[\"order_id\"])"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Revenue by country"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": [
    "revenue_by_country = {}\n",
    "for order in clean_orders:\n",
    "    country = order[\"country\"]\n",
    "    revenue_by_country[country] = revenue_by_country.get(country, Decimal(\"0\")) + order[\"amount\"]\n",
    "revenue_by_country"
   ]
  }
 ],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3",
   "language": "python",
   "name": "python3"
  },
  "language_info": {
   "name": "python",
   "version": "3.9.6"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 4
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
