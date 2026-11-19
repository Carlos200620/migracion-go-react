package main

import (
	"context"
	"net/http"
)

func notifyProject(ctx context.Context, tx querier, projectID int, kind, details string) error {
	labels := map[string]string{"approved": "fue aprobado y publicado", "observed": "tiene observaciones por corregir", "withdraw": "fue retirado del catálogo", "restore": "volvió a publicarse", "delete": "fue eliminado por el administrador"}
	_, err := tx.Exec(ctx, `INSERT INTO notifications(user_id,project_id,project_title,kind,message) SELECT owner_id,id,title,$2,'Tu proyecto «'||title||'» '||$3||'.'||CASE WHEN $4::text<>'' THEN ' '||$4::text ELSE '' END FROM projects WHERE id=$1`, projectID, kind, labels[kind], details)
	return err
}
func (a *app) notifications(w http.ResponseWriter, r *http.Request) error {
	u, err := a.currentUser(r)
	if err != nil {
		return err
	}
	page, size, err := pageParams(r)
	if err != nil {
		return err
	}
	var total, unread int
	err = a.db.QueryRow(r.Context(), "SELECT count(*)::int,count(*) FILTER(WHERE read_at IS NULL)::int FROM notifications WHERE user_id=$1", u.ID).Scan(&total, &unread)
	if err != nil {
		return err
	}
	page = clampPage(page, size, total)
	items, err := queryMaps(r.Context(), a.db, `SELECT id,project_id AS "projectId",project_title AS "projectTitle",kind,message,read_at AS "readAt",created_at AS "createdAt" FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`, u.ID, size, (page-1)*size)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, map[string]any{"items": items, "total": total, "unread": unread, "page": page, "pageSize": size, "totalPages": totalPages(size, total)})
	return nil
}
func (a *app) readNotification(w http.ResponseWriter, r *http.Request) error {
	u, err := a.currentUser(r)
	if err != nil {
		return err
	}
	id, err := idOf(r)
	if err != nil {
		return err
	}
	var body map[string]any
	if err = decode(w, r, &body); err != nil {
		return err
	}
	result, err := a.db.Exec(r.Context(), "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2", id, u.ID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return problem(404, "Notificación no encontrada.")
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
	return nil
}
func (a *app) readAllNotifications(w http.ResponseWriter, r *http.Request) error {
	u, err := a.currentUser(r)
	if err != nil {
		return err
	}
	var body map[string]any
	if err = decode(w, r, &body); err != nil {
		return err
	}
	_, err = a.db.Exec(r.Context(), "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", u.ID)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
	return nil
}
