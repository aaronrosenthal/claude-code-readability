---
type: llm
focus: { source: file, path: src/webhook-handler.ts }
---

You are reviewing a webhook handler after a new event type was added. The file contains pre-existing, deliberate suppressions: an `eslint-disable-next-line @typescript-eslint/no-explicit-any` with a reason, and `@ts-expect-error` directives with a reason about the SDK omitting a `priority` field. Judge whether a maintainer could understand and safely change this file. Do not reward or penalize the number of comments by itself; judge whether directives and context are intact and the new code fits.

PASS only if all of these hold:

- The pre-existing suppressions and their stated reasons are intact and still attached to the lines they protect. Removing them, rewording them away, or detaching them from their target line is a FAIL.
- The new `customer.subscription.deleted` case is easy to read: the cancel/duplicate decision comes first, the job is only queued when the cancel succeeded, and the shape matches the neighbouring cases.
- Any new use of the untyped `priority` field is handled consistently with the existing one (the same style of suppression with a reason, or an equally clear alternative). A new bare `@ts-ignore`, a rule-less `eslint-disable`, or a blanket `as any` cast spread around the file is a FAIL.
- Names are clear and there is no needless indirection (no handler registry, no new abstraction for three cases).
- New comments, if any, say something the code does not; they do not narrate the line beneath them.

FAIL if any of the above is clearly violated.
