#!/usr/bin/env bash
set -euo pipefail
mkdir -p pricing
cat > go.mod <<'EOF'
module example.com/storefront

go 1.21
EOF
cat > pricing/pricing.go <<'EOF'
// Package pricing computes cart totals in integer cents.
package pricing

import "errors"

// ErrInvalidPercent is returned when a discount percentage is outside 0-100.
var ErrInvalidPercent = errors.New("pricing: percent must be between 0 and 100")

// Line is one product in a cart.
type Line struct {
	SKU       string
	UnitCents int64
	Qty       int
}

// Subtotal returns the sum of all line totals.
func Subtotal(lines []Line) int64 {
	var total int64
	for _, l := range lines {
		total += l.UnitCents * int64(l.Qty)
	}
	return total
}

// ApplyPercentOff reduces cents by percent, rounding the discount down so the
// customer is never charged less than the advertised price.
func ApplyPercentOff(cents int64, percent int) (int64, error) {
	if percent < 0 || percent > 100 {
		return 0, ErrInvalidPercent
	}
	discount := cents * int64(percent) / 100
	return cents - discount, nil
}

// WithTax adds tax at the given rate in basis points (1/100 of a percent),
// rounding half up.
func WithTax(cents int64, rateBasisPoints int) int64 {
	tax := (cents*int64(rateBasisPoints) + 5000) / 10000
	return cents + tax
}
EOF
cat > pricing/pricing_test.go <<'EOF'
package pricing

import "testing"

func TestSubtotal(t *testing.T) {
	lines := []Line{{SKU: "mug", UnitCents: 1250, Qty: 2}, {SKU: "tee", UnitCents: 2000, Qty: 1}}
	if got := Subtotal(lines); got != 4500 {
		t.Errorf("Subtotal() = %d, want 4500", got)
	}
	if got := Subtotal(nil); got != 0 {
		t.Errorf("Subtotal(nil) = %d, want 0", got)
	}
}

func TestApplyPercentOffRoundsDiscountDown(t *testing.T) {
	got, err := ApplyPercentOff(999, 15)
	if err != nil || got != 850 {
		t.Errorf("ApplyPercentOff(999, 15) = %d, %v; want 850, nil", got, err)
	}
}

func TestApplyPercentOffRejectsBadPercent(t *testing.T) {
	for _, percent := range []int{-1, 101} {
		if _, err := ApplyPercentOff(1000, percent); err != ErrInvalidPercent {
			t.Errorf("percent %d: error = %v, want ErrInvalidPercent", percent, err)
		}
	}
}

func TestWithTaxRoundsHalfUp(t *testing.T) {
	if got := WithTax(1050, 825); got != 1137 {
		t.Errorf("WithTax(1050, 825) = %d, want 1137", got)
	}
}
EOF
cat > pricing/shipping_gap_test.go <<'EOF'
package pricing

import "testing"

func TestFreeShippingGap(t *testing.T) {
	lines := []Line{{SKU: "mug", UnitCents: 1250, Qty: 2}, {SKU: "tee", UnitCents: 2000, Qty: 1}}

	tests := []struct {
		name      string
		lines     []Line
		threshold int64
		want      int64
	}{
		{"below threshold", lines, 5000, 500},
		{"exactly at threshold", lines, 4500, 0},
		{"above threshold", lines, 3000, 0},
		{"empty cart", nil, 5000, 5000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := FreeShippingGap(tt.lines, tt.threshold); got != tt.want {
				t.Errorf("FreeShippingGap() = %d, want %d", got, tt.want)
			}
		})
	}
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
