package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

func (a *app) summary(w http.ResponseWriter, r *http.Request, u user) error {
	v, err := queryMap(r.Context(), a.db, "SELECT count(*) FILTER(WHERE status='pending')::integer AS pending,count(*) FILTER(WHERE status='observed')::integer AS observed,count(*) FILTER(WHERE status='approved')::integer AS approved FROM projects")
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}
func (a *app) adminList(w http.ResponseWriter, r *http.Request, u user) error {
	return a.listPage(w, r, 0, false, true)
}

func (a *app) adminDetail(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	v, err := queryMap(r.Context(), a.db, "SELECT "+projectFields+projectJoins+"WHERE p.id=$1", id)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}
func (a *app) review(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	var input struct {
		Decision     string `json:"decision"`
		Observations string `json:"observations"`
		Version      string `json:"version"`
	}
	if err = decode(w, r, &input); err != nil {
		return err
	}
	input.Observations = strings.TrimSpace(input.Observations)
	if (input.Decision != "approved" && input.Decision != "observed") || utf8.RuneCountInString(input.Observations) > 5000 || input.Version == "" || len(input.Version) > 100 {
		return problem(400, "Selecciona una decisión válida y revisa las observaciones.")
	}
	if input.Decision == "observed" && input.Observations == "" {
		return problem(400, "Escribe las observaciones para devolver el proyecto.")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var status, version string
	if err = tx.QueryRow(r.Context(), "SELECT status,updated_at::text FROM projects WHERE id=$1 FOR UPDATE", id).Scan(&status, &version); err != nil {
		return problem(404, "Proyecto no encontrado.")
	}
	if status != "pending" || version != input.Version {
		return problem(409, "El proyecto cambió o ya fue revisado. Recarga su detalle antes de continuar.")
	}
	if input.Decision == "approved" {
		var key string
		if err = tx.QueryRow(r.Context(), "SELECT storage_key FROM documents WHERE project_id=$1", id).Scan(&key); err != nil {
			return problem(409, "El proyecto no tiene un PDF adjunto.")
		}
		path, err := a.documentPath(key)
		if err != nil || !fileExists(path) {
			return problem(409, "No se encuentra el PDF. No se puede publicar este proyecto.")
		}
	}
	_, err = tx.Exec(r.Context(), "UPDATE projects SET status=$1::varchar(20),observations=$2,reviewed_by=$3,published_at=CASE WHEN $1::varchar(20)='approved' THEN now() ELSE NULL END,updated_at=now() WHERE id=$4", input.Decision, input.Observations, u.ID, id)
	if err != nil {
		return err
	}
	if err = notifyProject(r.Context(), tx, id, input.Decision, input.Observations); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	message := "Proyecto aprobado y publicado."
	if input.Decision == "observed" {
		message = "Proyecto devuelto con observaciones."
	}
	jsonResponse(w, 200, map[string]string{"message": message})
	return nil
}
func (a *app) history(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	v, err := queryMaps(r.Context(), a.db, `SELECT id,action,actor_name AS "actorName",reason,previous_status AS "previousStatus",created_at AS "createdAt" FROM project_events WHERE project_id=$1 ORDER BY created_at DESC,id DESC`, id)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}
func (a *app) lifecycle(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	var input struct {
		Action       string `json:"action"`
		Reason       string `json:"reason"`
		Version      string `json:"version"`
		Confirmation string `json:"confirmation"`
	}
	if err = decode(w, r, &input); err != nil {
		return err
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if (input.Action != "withdraw" && input.Action != "restore" && input.Action != "delete") || input.Reason == "" || utf8.RuneCountInString(input.Reason) > 1000 || input.Version == "" || len(input.Version) > 100 {
		return problem(400, "Completa el motivo (máximo 1000 caracteres) y confirma la acción.")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var title, status, version string
	if err = tx.QueryRow(r.Context(), "SELECT title,status,updated_at::text FROM projects WHERE id=$1 FOR UPDATE", id).Scan(&title, &status, &version); err != nil {
		return problem(404, "Proyecto no encontrado.")
	}
	if version != input.Version {
		return problem(409, "El proyecto cambió. Recarga sus datos antes de continuar.")
	}
	if input.Action == "withdraw" && status != "approved" {
		return problem(409, "Solo se pueden retirar proyectos publicados.")
	}
	if input.Action == "restore" && status != "withdrawn" {
		return problem(409, "Solo se pueden restaurar proyectos retirados.")
	}
	if input.Action == "delete" && input.Confirmation != title {
		return problem(400, "Escribe exactamente el título del proyecto para confirmar la eliminación.")
	}
	docs, err := queryMaps(r.Context(), tx, "SELECT storage_key FROM documents WHERE project_id=$1", id)
	if err != nil {
		return err
	}
	key := ""
	if len(docs) > 0 {
		key = docs[0]["storage_key"].(string)
	}
	if input.Action == "restore" {
		path, err := a.documentPath(key)
		if err != nil || !fileExists(path) {
			return problem(409, "No se encuentra el PDF del proyecto.")
		}
	}
	_, err = tx.Exec(r.Context(), "INSERT INTO project_events(project_id,project_title,actor_id,actor_name,action,previous_status,reason) VALUES($1,$2,$3,$4,$5,$6,$7)", id, title, u.ID, u.FullName, input.Action, status, input.Reason)
	if err != nil {
		return err
	}
	if err = notifyProject(r.Context(), tx, id, input.Action, input.Reason); err != nil {
		return err
	}
	if input.Action == "delete" {
		if key != "" {
			if _, err = tx.Exec(r.Context(), "INSERT INTO pending_file_deletions(storage_key) VALUES($1) ON CONFLICT DO NOTHING", key); err != nil {
				return err
			}
		}
		_, err = tx.Exec(r.Context(), "DELETE FROM projects WHERE id=$1", id)
	} else {
		newStatus, reason := "approved", ""
		if input.Action == "withdraw" {
			newStatus, reason = "withdrawn", input.Reason
		}
		_, err = tx.Exec(r.Context(), "UPDATE projects SET status=$1::varchar(20),withdrawal_reason=$2,updated_at=now() WHERE id=$3", newStatus, reason, id)
	}
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	pending := false
	message := "Proyecto retirado del catálogo."
	if input.Action == "restore" {
		message = "Proyecto restaurado y publicado."
	}
	if input.Action == "delete" {
		message = "Proyecto y PDF eliminados."
		if key != "" {
			pending = !a.flushDeletion(r.Context(), key)
			if pending {
				message = "Proyecto eliminado. La eliminación del PDF se reintentará automáticamente."
			}
		}
	}
	jsonResponse(w, 200, map[string]any{"message": message, "cleanupPending": pending})
	return nil
}
func (a *app) categories(w http.ResponseWriter, r *http.Request, u user) error {
	v, err := queryMaps(r.Context(), a.db, `SELECT c.id,c.name,c.description,c.active,(SELECT count(*)::integer FROM projects p WHERE p.category_id=c.id) AS "projectCount" FROM categories c ORDER BY c.name`)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}
func (a *app) saveCategory(w http.ResponseWriter, r *http.Request, u user) error {
	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Active      bool   `json:"active"`
	}
	input.Active = true
	if err := decode(w, r, &input); err != nil {
		return err
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 100 || utf8.RuneCountInString(input.Description) > 1000 {
		return problem(400, "Completa el nombre (hasta 100 caracteres) y la descripción (hasta 1000).")
	}
	id := 0
	var err error
	if r.Method == "PUT" {
		id, err = idOf(r)
		if err != nil {
			return err
		}
	}
	var duplicate bool
	err = a.db.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM categories WHERE lower(name)=lower($1) AND id<>$2)", input.Name, id).Scan(&duplicate)
	if err != nil {
		return err
	}
	if duplicate {
		return problem(409, "Ya existe una categoría con ese nombre.")
	}
	var v map[string]any
	code := 200
	if id == 0 {
		code = 201
		v, err = queryMap(r.Context(), a.db, "INSERT INTO categories(name,description,active) VALUES($1,$2,$3) RETURNING id,name,description,active", input.Name, input.Description, input.Active)
	} else {
		v, err = queryMap(r.Context(), a.db, "UPDATE categories SET name=$1,description=$2,active=$3 WHERE id=$4 RETURNING id,name,description,active", input.Name, input.Description, input.Active, id)
	}
	if err != nil {
		return err
	}
	jsonResponse(w, code, v)
	return nil
}
func (a *app) categoryStatus(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	var input struct {
		Active *bool `json:"active"`
	}
	if err = decode(w, r, &input); err != nil {
		return err
	}
	if input.Active == nil {
		return problem(400, "Indica un estado de categoría válido.")
	}
	v, err := queryMap(r.Context(), a.db, "UPDATE categories SET active=$1 WHERE id=$2 RETURNING id,name,description,active", *input.Active, id)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}
func (a *app) flushDeletion(ctx context.Context, key string) bool {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return false
	}
	defer tx.Rollback(ctx)
	var job string
	if err = tx.QueryRow(ctx, "SELECT storage_key FROM pending_file_deletions WHERE storage_key=$1 FOR UPDATE", key).Scan(&job); err != nil {
		return false
	}
	var referenced bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM documents WHERE storage_key=$1)", key).Scan(&referenced); err != nil || referenced {
		return false
	}
	path, err := a.documentPath(key)
	if err != nil {
		return false
	}
	if err = os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return false
	}
	if _, err = tx.Exec(ctx, "DELETE FROM pending_file_deletions WHERE storage_key=$1", key); err != nil {
		return false
	}
	return tx.Commit(ctx) == nil
}
func (a *app) cleanupWorker(ctx context.Context) {
	run := func() {
		jobs, err := queryMaps(ctx, a.db, "SELECT storage_key FROM pending_file_deletions ORDER BY created_at LIMIT 25")
		if err == nil {
			for _, job := range jobs {
				a.flushDeletion(ctx, job["storage_key"].(string))
			}
		}
	}
	run()
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}
