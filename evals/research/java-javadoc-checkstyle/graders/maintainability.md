---
type: llm
focus: { source: file, path: src/main/java/com/acme/inventory/ReorderPlanner.java }
---

Judge whether a maintainer could understand `ReorderPlanner` and change it safely, in a codebase where checkstyle requires Javadoc on public types and methods. Do not reward or penalize the number of comments by itself; required Javadoc is part of the contract here, not noise.

PASS only if all of these hold:

1. The public class and both public methods carry Javadoc that is present and informative: it states what the method returns and in which situations (for example the reorder point boundary and the ordering of suggestions), not just a restatement of the method name.
2. Javadoc and code agree: the documented rules match what the code does.
3. Names of methods, parameters, and locals are clear, and the implementation is short and straightforward with no needless indirection (no extra interfaces, strategies, or helper classes for two small methods).
4. Non-public helpers, if any, are understandable from their names and bodies without leaning on commentary, and there is no commentary that only narrates the code line by line.
5. Nothing is done to evade the documentation rule (no suppression markers or config changes).

FAIL if any condition is violated, for example Javadoc missing or placeholder text such as "Gets the quantity", docs that contradict the code, or convoluted logic for a simple rule.
