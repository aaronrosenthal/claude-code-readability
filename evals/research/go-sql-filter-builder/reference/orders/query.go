package orders

import (
	"fmt"
	"strings"
)

const selectOrders = "SELECT id, customer_id, status, total_cents, created_at FROM orders"

const (
	defaultLimit = 50
	maxLimit     = 200
)

var sortColumns = map[string]bool{
	"created_at":  true,
	"total_cents": true,
	"status":      true,
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// BuildOrderQuery returns the SQL and arguments that search orders by f.
func BuildOrderQuery(f OrderFilter) (string, []any, error) {
	orderBy, err := orderByClause(f)
	if err != nil {
		return "", nil, err
	}
	limit, err := pageLimit(f)
	if err != nil {
		return "", nil, err
	}
	if f.Offset < 0 {
		return "", nil, ErrInvalidPagination
	}

	var q queryBuilder
	if f.CustomerID != "" {
		q.where("customer_id = " + q.arg(f.CustomerID))
	}
	if len(f.Status) > 0 {
		placeholders := make([]string, len(f.Status))
		for i, status := range f.Status {
			placeholders[i] = q.arg(status)
		}
		q.where("status IN (" + strings.Join(placeholders, ", ") + ")")
	}
	if f.Search != "" {
		q.where("customer_email ILIKE " + q.arg("%"+likeEscaper.Replace(f.Search)+"%"))
	}
	if f.MinTotalCents != nil {
		q.where("total_cents >= " + q.arg(*f.MinTotalCents))
	}
	if f.MaxTotalCents != nil {
		q.where("total_cents <= " + q.arg(*f.MaxTotalCents))
	}
	if !f.CreatedAfter.IsZero() {
		q.where("created_at >= " + q.arg(f.CreatedAfter))
	}
	if !f.CreatedBefore.IsZero() {
		q.where("created_at < " + q.arg(f.CreatedBefore))
	}

	sql := selectOrders
	if len(q.conditions) > 0 {
		sql += " WHERE " + strings.Join(q.conditions, " AND ")
	}
	sql += " ORDER BY " + orderBy
	sql += fmt.Sprintf(" LIMIT %s OFFSET %s", q.arg(limit), q.arg(f.Offset))

	return sql, q.args, nil
}

func orderByClause(f OrderFilter) (string, error) {
	if f.SortBy == "" {
		return "created_at DESC, id ASC", nil
	}
	if !sortColumns[f.SortBy] {
		return "", ErrInvalidSort
	}
	direction := "ASC"
	if f.Desc {
		direction = "DESC"
	}
	return f.SortBy + " " + direction + ", id ASC", nil
}

func pageLimit(f OrderFilter) (int, error) {
	switch {
	case f.Limit < 0:
		return 0, ErrInvalidPagination
	case f.Limit == 0:
		return defaultLimit, nil
	case f.Limit > maxLimit:
		return maxLimit, nil
	default:
		return f.Limit, nil
	}
}

type queryBuilder struct {
	conditions []string
	args       []any
}

func (q *queryBuilder) arg(value any) string {
	q.args = append(q.args, value)
	return fmt.Sprintf("$%d", len(q.args))
}

func (q *queryBuilder) where(condition string) {
	q.conditions = append(q.conditions, condition)
}
