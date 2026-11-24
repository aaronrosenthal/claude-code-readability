---
type: regex
target: { source: file, path: retention/report.py }
match: not_contains
pattern: "\\bf[\"']|\\.format\\(|[\"']\\s*%\\s|[\"']\\s*\\+\\s*(?:event_name|first_cohort|last_cohort)"
---
