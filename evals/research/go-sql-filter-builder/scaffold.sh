#!/usr/bin/env bash
set -euo pipefail
mkdir -p orders
cat > go.mod <<'EOF'
module example.com/ordersvc

go 1.21
EOF
cat > orders/errors.go <<'EOF'
package orders

import "errors"

var (
	// ErrInvalidSort is returned when OrderFilter.SortBy is not a sortable column.
	ErrInvalidSort = errors.New("orders: invalid sort column")

	// ErrInvalidPagination is returned for a negative limit or offset.
	ErrInvalidPagination = errors.New("orders: invalid pagination")
)
EOF
cat > orders/filter.go <<'EOF'
package orders

import "time"

// OrderFilter describes an order search. Zero values mean "not set".
type OrderFilter struct {
	CustomerID    string
	Status        []string
	Search        string
	MinTotalCents *int64
	MaxTotalCents *int64
	CreatedAfter  time.Time
	CreatedBefore time.Time

	SortBy string
	Desc   bool
	Limit  int
	Offset int
}
EOF
cat > orders/query.go <<'EOF'
package orders

// BuildOrderQuery returns the SQL and arguments that search orders by f.
func BuildOrderQuery(f OrderFilter) (string, []any, error) {
	return "", nil, nil
}
EOF
cat > orders/query_test.go <<'EOF'
package orders

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

const base = "SELECT id, customer_id, status, total_cents, created_at FROM orders"

func int64Ptr(v int64) *int64 { return &v }

func TestBuildOrderQuery(t *testing.T) {
	after := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	before := time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		filter   OrderFilter
		wantSQL  string
		wantArgs []any
	}{
		{
			name:     "empty filter",
			filter:   OrderFilter{},
			wantSQL:  base + " ORDER BY created_at DESC, id ASC LIMIT $1 OFFSET $2",
			wantArgs: []any{50, 0},
		},
		{
			name:     "customer and statuses",
			filter:   OrderFilter{CustomerID: "c-42", Status: []string{"paid", "shipped"}},
			wantSQL:  base + " WHERE customer_id = $1 AND status IN ($2, $3) ORDER BY created_at DESC, id ASC LIMIT $4 OFFSET $5",
			wantArgs: []any{"c-42", "paid", "shipped", 50, 0},
		},
		{
			name:     "search escapes like wildcards",
			filter:   OrderFilter{Search: `50%_off\sale`},
			wantSQL:  base + " WHERE customer_email ILIKE $1 ORDER BY created_at DESC, id ASC LIMIT $2 OFFSET $3",
			wantArgs: []any{`%50\%\_off\\sale%`, 50, 0},
		},
		{
			name:     "total range",
			filter:   OrderFilter{MinTotalCents: int64Ptr(0), MaxTotalCents: int64Ptr(9900)},
			wantSQL:  base + " WHERE total_cents >= $1 AND total_cents <= $2 ORDER BY created_at DESC, id ASC LIMIT $3 OFFSET $4",
			wantArgs: []any{int64(0), int64(9900), 50, 0},
		},
		{
			name:     "date range is half open",
			filter:   OrderFilter{CreatedAfter: after, CreatedBefore: before},
			wantSQL:  base + " WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC, id ASC LIMIT $3 OFFSET $4",
			wantArgs: []any{after, before, 50, 0},
		},
		{
			name:     "sort ascending by status",
			filter:   OrderFilter{SortBy: "status"},
			wantSQL:  base + " ORDER BY status ASC, id ASC LIMIT $1 OFFSET $2",
			wantArgs: []any{50, 0},
		},
		{
			name:     "sort descending by total",
			filter:   OrderFilter{SortBy: "total_cents", Desc: true},
			wantSQL:  base + " ORDER BY total_cents DESC, id ASC LIMIT $1 OFFSET $2",
			wantArgs: []any{50, 0},
		},
		{
			name:     "limit is capped",
			filter:   OrderFilter{Limit: 500, Offset: 40},
			wantSQL:  base + " ORDER BY created_at DESC, id ASC LIMIT $1 OFFSET $2",
			wantArgs: []any{200, 40},
		},
		{
			name: "every field numbers placeholders in order",
			filter: OrderFilter{
				CustomerID:    "c-7",
				Status:        []string{"paid"},
				Search:        "ann@",
				MinTotalCents: int64Ptr(100),
				MaxTotalCents: int64Ptr(500),
				CreatedAfter:  after,
				CreatedBefore: before,
				SortBy:        "created_at",
				Desc:          true,
				Limit:         10,
				Offset:        20,
			},
			wantSQL: base + " WHERE customer_id = $1 AND status IN ($2) AND customer_email ILIKE $3" +
				" AND total_cents >= $4 AND total_cents <= $5 AND created_at >= $6 AND created_at < $7" +
				" ORDER BY created_at DESC, id ASC LIMIT $8 OFFSET $9",
			wantArgs: []any{"c-7", "paid", "%ann@%", int64(100), int64(500), after, before, 10, 20},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sql, args, err := BuildOrderQuery(tt.filter)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if sql != tt.wantSQL {
				t.Errorf("sql =\n%s\nwant\n%s", sql, tt.wantSQL)
			}
			if !reflect.DeepEqual(args, tt.wantArgs) {
				t.Errorf("args = %#v, want %#v", args, tt.wantArgs)
			}
		})
	}
}

func TestBuildOrderQueryRejectsUnknownSortColumn(t *testing.T) {
	for _, sortBy := range []string{"customer_email", "total_cents; DROP TABLE orders", "TOTAL_CENTS", " status"} {
		sql, args, err := BuildOrderQuery(OrderFilter{SortBy: sortBy})
		if !errors.Is(err, ErrInvalidSort) {
			t.Errorf("SortBy %q: error = %v, want ErrInvalidSort", sortBy, err)
		}
		if sql != "" || args != nil {
			t.Errorf("SortBy %q: got sql %q and args %v alongside the error", sortBy, sql, args)
		}
	}
}

func TestBuildOrderQueryRejectsNegativePagination(t *testing.T) {
	for _, filter := range []OrderFilter{{Limit: -1}, {Offset: -5}} {
		if _, _, err := BuildOrderQuery(filter); !errors.Is(err, ErrInvalidPagination) {
			t.Errorf("filter %+v: error = %v, want ErrInvalidPagination", filter, err)
		}
	}
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
