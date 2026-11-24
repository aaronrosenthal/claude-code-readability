---
description: Add a new public class to a Java module whose CI enforces Javadoc via checkstyle.
tags: [research, java, javadoc-required, new-class]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Purchasing wants automatic reorder suggestions. Please add a `ReorderPlanner` class in `src/main/java/com/acme/inventory/` that builds on the existing `Warehouse`, `StockItem` and `ReorderSuggestion` types. It needs a public no-argument constructor (the default one is fine) and two public methods:

- `int quantityToOrder(StockItem item)` returns 0 while the item's projected stock (on hand plus on order) is above its reorder point. Once projected stock is at or below the reorder point it returns the gap up to the item's target level.
- `List<ReorderSuggestion> suggest(Warehouse warehouse)` returns one suggestion per item that needs ordering, largest quantity first and then by SKU.

The tests in `src/test/java/TestRunner.java` describe the expected behavior already, so don't edit them. Our CI also runs checkstyle with the `checkstyle.xml` at the repo root on everything under `src/main`, and a failure there blocks the merge.

When you're done, run `javac -d out $(find src -name '*.java') && java -cp out TestRunner` and save its complete output to `test-results.txt`.
