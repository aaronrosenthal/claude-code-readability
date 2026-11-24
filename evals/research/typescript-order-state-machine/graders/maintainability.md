---
type: llm
focus: { source: file, path: src/order.ts }
---

You are reviewing the `Order` state machine in a fulfilment service. Judge whether a maintainer could understand it and safely change it, for example by adding a `returned` status or a new event. Do not reward or penalize the number of comments by itself; judge whether the code and any comments present make the rules clear.

PASS only if all of these hold:

- The set of legal transitions is easy to find and read in one place (a table, or a single well-organised switch), so a maintainer can see the whole lifecycle without tracing several methods.
- `apply` and `canApply` agree by construction (they consult the same rule source) rather than duplicating the rules in two forms that can drift apart.
- `apply` validates before mutating, so a rejected event cannot leave status and history half-updated.
- Names are domain names (status, event, history, transition) and nothing is misleading.
- There is no needless indirection: no handler class hierarchy, no generic state-machine framework, no unused options or hooks beyond what the task asked for.
- Comments, if any, explain something the code cannot say (a business rule, a constraint). They do not restate the line beneath them.

FAIL if any of the above is clearly violated, for example the rules are scattered across nested conditionals in several methods, or the implementation introduces an abstraction layer larger than the problem.
