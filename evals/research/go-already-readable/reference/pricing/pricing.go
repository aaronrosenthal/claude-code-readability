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

// FreeShippingGap returns how many more cents the cart needs to reach
// thresholdCents, or zero if it already qualifies.
func FreeShippingGap(lines []Line, thresholdCents int64) int64 {
	gap := thresholdCents - Subtotal(lines)
	if gap < 0 {
		return 0
	}
	return gap
}
