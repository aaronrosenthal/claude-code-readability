package com.acme.inventory;

import java.util.Comparator;
import java.util.List;

/** Works out which SKUs a warehouse should reorder and how much of each. */
public final class ReorderPlanner {

    /**
     * Returns how many units of an item to order right now.
     *
     * @param item the stock position to evaluate
     * @return zero while projected stock is above the reorder point, otherwise the gap to the target level
     */
    public int quantityToOrder(StockItem item) {
        if (item.projectedStock() > item.reorderPoint()) {
            return 0;
        }
        return item.targetLevel() - item.projectedStock();
    }

    /**
     * Suggests purchases for every item in a warehouse that needs restocking.
     *
     * @param warehouse the warehouse to evaluate
     * @return suggestions ordered by quantity, largest first, then by SKU
     */
    public List<ReorderSuggestion> suggest(Warehouse warehouse) {
        return warehouse.items().stream()
                .map(item -> new ReorderSuggestion(item.sku(), quantityToOrder(item)))
                .filter(suggestion -> suggestion.quantity() > 0)
                .sorted(Comparator.comparingInt(ReorderSuggestion::quantity).reversed()
                        .thenComparing(ReorderSuggestion::sku))
                .toList();
    }
}
