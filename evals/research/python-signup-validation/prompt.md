---
description: Implement signup form validation that reports every field error at once.
tags: [research, python, validation-logic]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

The signup page needs server-side validation. `accounts/validation.py` has a stub for `validate_signup(form, today)`. It takes the submitted form (a dict of strings; missing keys are the same as blank) and returns a dict of `field -> list of error codes`, containing only fields that have errors, so the page can show everything wrong in one round trip. Return `{}` for a valid form. Values are stripped of surrounding whitespace first.

Rules, with the error codes the frontend expects (report every code that applies unless noted):

- `email`: `required` if blank (nothing else is reported); `invalid` unless it looks like `local@domain.tld` (exactly one `@`, a non-empty local part, a dot inside the domain, no whitespace).
- `username`: `required` if blank (nothing else); `length` (3-20 characters); `characters` (must start with a letter, then letters, digits or underscores); `reserved` (`admin`, `root`, `support`, case-insensitive).
- `password`: `required` if blank (nothing else); `too_short` (under 12 characters); `needs_upper`; `needs_lower`; `needs_digit`; `contains_username` (case-insensitive, only when a username was given). Report them in that order.
- `birthdate`: `required` if blank; `invalid` unless it is a real `YYYY-MM-DD` date; `future` if after `today`; `too_young` if under 16 on `today` (a 16th birthday on `today` is fine).
- `country`: `required` if blank; `unsupported` unless one of US, CA, GB, DE.
- `postal_code`: `required` if blank; otherwise `invalid` if it does not match the country's format: US `12345` or `12345-6789`, CA `A1A 1A1` (space optional, letters case-insensitive, no D, F, I, O, Q, U), GB `SW1A 1AA` style (one or two letters, a digit, an optional letter or digit, optional space, a digit and two letters, case-insensitive), DE five digits. Skip the format check when the country is blank or unsupported.

`today` is passed in so the tests don't depend on the clock. The tests are in `tests/test_validation.py`.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
