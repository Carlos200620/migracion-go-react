package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func pageParams(r *http.Request) (int, int, error) {
	page, size := 1, 12
	for key, target := range map[string]*int{"page": &page, "pageSize": &size} {
		if raw := r.URL.Query().Get(key); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil || value < 1 {
				return 0, 0, problem(400, "La página y el tamaño deben ser números positivos.")
			}
			*target = value
		}
	}
	if page > 1000000 || size > 50 {
		return 0, 0, problem(400, "Solicita hasta 50 resultados por página.")
	}
	return page, size, nil
}
func totalPages(size, total int) int      { return max(1, (total+size-1)/size) }
func clampPage(page, size, total int) int { return min(page, totalPages(size, total)) }
func (a *app) listPage(w http.ResponseWriter, r *http.Request, ownerID int, public, admin bool) error {
	page, size, err := pageParams(r)
	if err != nil {
		return err
	}
	q := r.URL.Query()
	args := []any{}
	conditions := []string{}
	add := func(sql string, value any) {
		args = append(args, value)
		conditions = append(conditions, fmt.Sprintf(sql, len(args)))
	}
	if public {
		conditions = append(conditions, "p.status='approved'")
	}
	if ownerID > 0 {
		add("p.owner_id=$%d", ownerID)
	}
	search := strings.TrimSpace(q.Get("q"))
	if utf8.RuneCountInString(search) > 200 {
		return problem(400, "La búsqueda admite hasta 200 caracteres.")
	}
	if search != "" {
		field := "p.title||' '||p.authors||' '||p.summary"
		if admin {
			field = "p.title||' '||u.full_name"
		}
		add("strpos(rp_normalize("+field+"),rp_normalize($%d))>0", search)
	}
	if category := q.Get("category"); category != "" && category != "Todas" {
		if utf8.RuneCountInString(category) > 100 {
			return problem(400, "Categoría no válida.")
		}
		add("c.name=$%d", category)
	}
	if year := q.Get("year"); year != "" {
		y, err := strconv.Atoi(year)
		if err != nil || y < 1900 || y > 2100 {
			return problem(400, "Año no válido.")
		}
		add("p.year=$%d", y)
	}
	if status := q.Get("status"); status != "" && !public {
		if status != "pending" && status != "observed" && status != "approved" && status != "withdrawn" {
			return problem(400, "Estado no válido.")
		}
		add("p.status=$%d", status)
	}
	for _, dateFilter := range []struct{ key, operator string }{{"from", ">="}, {"to", "<="}} {
		if raw := q.Get(dateFilter.key); raw != "" {
			if _, err := time.Parse("2006-01-02", raw); err != nil {
				return problem(400, "Fecha no válida.")
			}
			add("(p.created_at AT TIME ZONE 'America/Lima')::date"+dateFilter.operator+"$%d::date", raw)
		}
	}
	if q.Get("from") != "" && q.Get("to") != "" && q.Get("from") > q.Get("to") {
		return problem(400, "La fecha inicial no puede ser posterior a la final.")
	}
	if len(conditions) == 0 {
		conditions = append(conditions, "true")
	}
	where := " WHERE " + strings.Join(conditions, " AND ")
	joins := projectJoins
	fields := projectFields
	order := "p.updated_at DESC,p.id DESC"
	if public {
		fields = publicFields
		order = "p.published_at DESC,p.id DESC"
	}
	var total int
	if err = a.db.QueryRow(r.Context(), "SELECT count(*)::int"+joins+where, args...).Scan(&total); err != nil {
		return err
	}
	page = clampPage(page, size, total)
	args = append(args, size, (page-1)*size)
	items, err := queryMaps(r.Context(), a.db, "SELECT "+fields+joins+where+" ORDER BY "+order+fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
	if err != nil {
		return err
	}
	response := map[string]any{"items": items, "total": total, "page": page, "pageSize": size, "totalPages": totalPages(size, total)}
	if public {
		filters, err := a.filters(r, true)
		if err != nil {
			return err
		}
		response["filters"] = filters
	}
	jsonResponse(w, 200, response)
	return nil
}
func (a *app) filters(r *http.Request, public bool) (map[string]any, error) {
	where := ""
	if public {
		where = " WHERE p.status='approved'"
	}
	categories, err := queryMaps(r.Context(), a.db, "SELECT DISTINCT c.name FROM categories c JOIN projects p ON p.category_id=c.id"+where+" ORDER BY c.name")
	if err != nil {
		return nil, err
	}
	years, err := queryMaps(r.Context(), a.db, "SELECT DISTINCT p.year FROM projects p"+where+" ORDER BY p.year DESC")
	if err != nil {
		return nil, err
	}
	names := []string{}
	values := []any{}
	for _, c := range categories {
		names = append(names, c["name"].(string))
	}
	for _, y := range years {
		values = append(values, y["year"])
	}
	return map[string]any{"categories": names, "years": values}, nil
}
func (a *app) projectFilters(w http.ResponseWriter, r *http.Request) error {
	v, err := a.filters(r, true)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}
func (a *app) adminProjectFilters(w http.ResponseWriter, r *http.Request, u user) error {
	v, err := a.filters(r, false)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}
