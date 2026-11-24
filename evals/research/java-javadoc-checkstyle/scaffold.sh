#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
out/
EOF_FIXTURE
cat > 'checkstyle.xml' <<'EOF_FIXTURE'
<?xml version="1.0"?>
<!DOCTYPE module PUBLIC
    "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
    "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
  <property name="severity" value="error"/>
  <module name="NewlineAtEndOfFile"/>
  <module name="FileTabCharacter"/>
  <module name="TreeWalker">
    <module name="MissingJavadocType">
      <property name="scope" value="public"/>
    </module>
    <module name="MissingJavadocMethod">
      <property name="scope" value="public"/>
    </module>
    <module name="JavadocMethod"/>
    <module name="UnusedImports"/>
    <module name="RedundantImport"/>
  </module>
</module>
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/inventory'
cat > 'src/main/java/com/acme/inventory/ReorderSuggestion.java' <<'EOF_FIXTURE'
package com.acme.inventory;

/**
 * A recommendation to buy more of one SKU.
 *
 * @param sku the stock keeping unit to reorder
 * @param quantity how many units to order, always positive
 */
public record ReorderSuggestion(String sku, int quantity) {
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/inventory'
cat > 'src/main/java/com/acme/inventory/StockItem.java' <<'EOF_FIXTURE'
package com.acme.inventory;

/**
 * Stock position of one SKU in one warehouse.
 *
 * @param sku the stock keeping unit
 * @param onHand units physically on the shelves
 * @param onOrder units on open purchase orders that have not arrived yet
 * @param reorderPoint projected stock at or below which the SKU must be reordered
 * @param targetLevel projected stock a reorder should bring the SKU back up to
 */
public record StockItem(String sku, int onHand, int onOrder, int reorderPoint, int targetLevel) {

    /**
     * Returns the stock the warehouse will hold once open purchase orders arrive.
     *
     * @return units on hand plus units on order
     */
    public int projectedStock() {
        return onHand + onOrder;
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/inventory'
cat > 'src/main/java/com/acme/inventory/Warehouse.java' <<'EOF_FIXTURE'
package com.acme.inventory;

import java.util.List;

/** A physical warehouse and the stock positions it currently holds. */
public final class Warehouse {
    private final String code;
    private final List<StockItem> items;

    /**
     * Creates a warehouse.
     *
     * @param code short warehouse code, such as {@code "AMS1"}
     * @param items the stock positions held there
     */
    public Warehouse(String code, List<StockItem> items) {
        this.code = code;
        this.items = List.copyOf(items);
    }

    /**
     * Returns the warehouse code.
     *
     * @return the short code identifying this warehouse
     */
    public String code() {
        return code;
    }

    /**
     * Returns the stock positions held in this warehouse.
     *
     * @return an unmodifiable list of stock items
     */
    public List<StockItem> items() {
        return items;
    }
}
EOF_FIXTURE
mkdir -p 'src/test/java'
cat > 'src/test/java/TestRunner.java' <<'EOF_FIXTURE'
import com.acme.inventory.ReorderPlanner;
import com.acme.inventory.ReorderSuggestion;
import com.acme.inventory.StockItem;
import com.acme.inventory.Warehouse;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class TestRunner {
    private interface Body {
        void run() throws Exception;
    }

    private static final List<String> failures = new ArrayList<>();
    private static int count = 0;

    private static void test(String name, Body body) {
        count++;
        try {
            body.run();
        } catch (Throwable t) {
            failures.add(name + ": " + t);
        }
    }

    private static void assertEquals(Object expected, Object actual) {
        if (!Objects.equals(expected, actual)) {
            throw new AssertionError("expected " + expected + " but was " + actual);
        }
    }

    public static void main(String[] args) {
        ReorderPlanner planner = new ReorderPlanner();

        test("projected stock includes open purchase orders", () ->
                assertEquals(14, new StockItem("A", 4, 10, 5, 20).projectedStock()));

        test("no order while stock is above the reorder point", () ->
                assertEquals(0, planner.quantityToOrder(new StockItem("A", 6, 0, 5, 20))));

        test("order up to the target when stock is below the reorder point", () ->
                assertEquals(17, planner.quantityToOrder(new StockItem("A", 3, 0, 5, 20))));

        test("order when stock is exactly at the reorder point", () ->
                assertEquals(15, planner.quantityToOrder(new StockItem("A", 5, 0, 5, 20))));

        test("open purchase orders count toward projected stock", () -> {
            assertEquals(0, planner.quantityToOrder(new StockItem("A", 3, 10, 5, 20)));
            assertEquals(7, planner.quantityToOrder(new StockItem("A", 3, 10, 13, 20)));
        });

        test("nothing is suggested for a well stocked warehouse", () ->
                assertEquals(List.of(),
                        planner.suggest(new Warehouse("AMS1", List.of(new StockItem("A", 50, 0, 5, 20))))));

        test("empty warehouse needs nothing", () ->
                assertEquals(List.of(), planner.suggest(new Warehouse("AMS1", List.of()))));

        test("suggestions are largest first, then by SKU", () -> {
            Warehouse warehouse = new Warehouse("AMS1", List.of(
                    new StockItem("C-3", 0, 0, 5, 10),
                    new StockItem("A-1", 2, 0, 5, 12),
                    new StockItem("OK", 40, 0, 5, 10),
                    new StockItem("B-2", 1, 0, 5, 11)));
            assertEquals(List.of(
                    new ReorderSuggestion("A-1", 10),
                    new ReorderSuggestion("B-2", 10),
                    new ReorderSuggestion("C-3", 10)),
                    planner.suggest(warehouse));
        });

        if (!failures.isEmpty()) {
            failures.forEach(failure -> System.out.println("FAIL " + failure));
            System.out.println(failures.size() + " of " + count + " TESTS FAILED");
            System.exit(1);
        }
        System.out.println("ALL " + count + " TESTS PASSED");
    }
}
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
