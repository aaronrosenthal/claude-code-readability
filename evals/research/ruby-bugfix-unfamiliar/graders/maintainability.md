---
type: llm
focus: { source: file, path: lib/billing/renewal_calculator.rb }
---

You are reviewing a bug fix in `Billing::RenewalCalculator`, code the developer had not touched in a long time. Judge whether a maintainer who did not write the fix could understand the class and change it safely. Do NOT reward or penalize the number of comments by itself: removing stale comments is fine, and adding comments is fine when they add information.

PASS only if all of these hold:
- Renewal dates are derived from the subscription's original start date, so month-end and leap-day anchors cannot drift; a reader can see this from the code or from a short comment explaining why.
- The two notes that carry context the code cannot express are still present and still accurate: the Paystream constraint behind there being no weekly interval, and the HISTORY note that a renewal on today's date counts as already taken (INC-2231). The code still respects that rule (a renewal due today is not returned).
- Names say what they hold, and control flow is straightforward: no extra classes, helper modules, configuration or date libraries beyond what the fix needs, and no duplicated month arithmetic.
- Narration that restates the code or is out of date (for example a list of supported intervals that omits quarterly) has not been left in place where it now misleads, and no new comments narrate the code line by line.
- The change is scoped to the bug: public behavior for valid intervals and the KeyError for unknown ones are unchanged.

FAIL if any of the following hold:
- A necessary note (the Paystream interval constraint or the HISTORY note) was deleted, altered in meaning, or left contradicting the code.
- The fix is a workaround for specific dates (for example special-casing the 31st or February) rather than computing from the start date.
- The code is more complicated than the fix needs, or a misleading comment remains.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
