---
type: regex
target: { source: file, path: pricing/discounts.py }
pattern: "# COMPAT: the Brightway partner feed sends quantities as strings \\(\"12\" or \"12\\.0\"\\), not ints\\.\\n    # Keep accepting both until they finish migrating \\(tracked in PORTAL-311\\)\\."
---
