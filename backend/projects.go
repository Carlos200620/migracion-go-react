package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const publicFields = `p.id,p.title,p.summary,p.objectives,p.authors,p.year,c.name AS category,p.published_at AS "publishedAt",EXISTS(SELECT 1 FROM documents d WHERE d.project_id=p.id) AS "hasDocument"`
const projectFields = `p.id,p.title,p.summary,p.objectives,p.authors,p.year,p.category_id AS "categoryId",c.name AS category,p.status,p.observations,p.withdrawal_reason AS "withdrawalReason",p.created_at AS "createdAt",p.updated_at AS "updatedAt",p.updated_at::text AS version,p.published_at AS "publishedAt",u.full_name AS "studentName",d.original_name AS "documentName"`
const projectJoins = ` FROM projects p JOIN users u ON u.id=p.owner_id JOIN categories c ON c.id=p.category_id LEFT JOIN documents d ON d.project_id=p.id `

func (a *app) publicProjects(w http.ResponseWriter, r *http.Request) error {
	return a.listPage(w, r, 0, true, false)
}

func (a *app) publicProject(w http.ResponseWriter, r *http.Request) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	v, err := queryMap(r.Context(), a.db, "SELECT "+publicFields+" FROM projects p JOIN categories c ON c.id=p.category_id WHERE p.status='approved' AND p.id=$1", id)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}

var storagePattern = regexp.MustCompile(`^[a-f0-9-]{36}\.pdf$`)

func (a *app) documentPath(key string) (string, error) {
	if !storagePattern.MatchString(key) {
		return "", problem(404, "Documento no encontrado.")
	}
	return filepath.Join(a.uploads, key), nil
}
func (a *app) download(w http.ResponseWriter, r *http.Request, query string, args ...any) error {
	var key, name string
	if err := a.db.QueryRow(r.Context(), query, args...).Scan(&key, &name); err != nil {
		return problem(404, "Documento no encontrado.")
	}
	file, err := a.documentPath(key)
	if err != nil {
		return err
	}
	f, err := os.Open(file)
	if err != nil {
		return problem(404, "El documento no está disponible.")
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/pdf")
	disposition := "attachment"
	if r.URL.Query().Get("inline") == "1" {
		disposition = "inline"
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": name}))
	w.Header().Set("Content-Security-Policy", "frame-ancestors 'self'")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	http.ServeContent(w, r, name, stat.ModTime(), f)
	return nil
}
func (a *app) publicDocument(w http.ResponseWriter, r *http.Request) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	return a.download(w, r, "SELECT d.storage_key,d.original_name FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.id=$1 AND p.status='approved'", id)
}
func (a *app) studentDocument(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	return a.download(w, r, "SELECT d.storage_key,d.original_name FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.id=$1 AND p.owner_id=$2", id, u.ID)
}
func (a *app) adminDocument(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	return a.download(w, r, "SELECT storage_key,original_name FROM documents WHERE project_id=$1", id)
}
func (a *app) studentList(w http.ResponseWriter, r *http.Request, u user) error {
	return a.listPage(w, r, u.ID, false, false)
}

func (a *app) studentDetail(w http.ResponseWriter, r *http.Request, u user) error {
	id, err := idOf(r)
	if err != nil {
		return err
	}
	v, err := queryMap(r.Context(), a.db, "SELECT "+projectFields+projectJoins+"WHERE p.owner_id=$1 AND p.id=$2", u.ID, id)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, v)
	return nil
}

type projectInput struct {
	Title, Summary, Objectives, Authors string
	Year, CategoryID                    int
}
type pdfInput struct {
	Name string
	Data []byte
}

func parseProject(r *http.Request) (projectInput, *pdfInput, error) {
	var p projectInput
	text := func(key string, max int) (string, error) {
		values := r.MultipartForm.Value[key]
		if len(values) != 1 {
			return "", problem(400, "Completa los campos obligatorios.")
		}
		v := strings.TrimSpace(values[0])
		if v == "" || utf8.RuneCountInString(v) > max {
			return "", problem(400, "Completa los campos obligatorios y respeta sus límites.")
		}
		return v, nil
	}
	for _, field := range []struct {
		key  string
		max  int
		dest *string
	}{{"title", 200, &p.Title}, {"summary", 10000, &p.Summary}, {"objectives", 10000, &p.Objectives}, {"authors", 500, &p.Authors}} {
		v, err := text(field.key, field.max)
		if err != nil {
			return p, nil, err
		}
		*field.dest = v
	}
	year, err := text("year", 4)
	if err != nil {
		return p, nil, err
	}
	category, err := text("categoryId", 10)
	if err != nil {
		return p, nil, err
	}
	p.Year, _ = strconv.Atoi(year)
	p.CategoryID, _ = strconv.Atoi(category)
	if !regexp.MustCompile(`^\d{4}$`).MatchString(year) || p.Year < 1900 || p.Year > 2100 || !regexp.MustCompile(`^\d+$`).MatchString(category) || p.CategoryID < 1 {
		return p, nil, problem(400, "Selecciona una categoría y un año válido (1900–2100).")
	}
	if len(r.MultipartForm.Value) != 6 {
		return p, nil, problem(400, "Envía únicamente los campos del formulario.")
	}
	var file *pdfInput
	for field, headers := range r.MultipartForm.File {
		if field != "document" || len(headers) != 1 {
			return p, nil, problem(400, "Envía un solo PDF.")
		}
		h := headers[0]
		if h.Size < 1 || h.Size > 10485760 || strings.ToLower(filepath.Ext(h.Filename)) != ".pdf" || h.Header.Get("Content-Type") != "application/pdf" {
			return p, nil, problem(400, "Adjunta un PDF válido de hasta 10 MB.")
		}
		f, err := h.Open()
		if err != nil {
			return p, nil, err
		}
		data, err := io.ReadAll(io.LimitReader(f, 10485761))
		f.Close()
		if err != nil {
			return p, nil, err
		}
		if err = validatePDF(data); err != nil {
			return p, nil, err
		}
		name := strings.Map(func(c rune) rune {
			if c < 32 || c == '/' || c == '\\' {
				return '_'
			}
			return c
		}, h.Filename)
		runes := []rune(name)
		if len(runes) > 255 {
			name = string(runes[:255])
		}
		file = &pdfInput{name, data}
	}
	return p, file, nil
}
func validatePDF(data []byte) error {
	if len(data) == 0 || len(data) > 10485760 || !bytes.HasPrefix(data, []byte("%PDF-")) || !bytes.Contains(data[max(0, len(data)-1024):], []byte("%%EOF")) {
		return problem(400, "Adjunta un PDF válido de hasta 10 MB.")
	}
	return nil
}
func (a *app) studentSave(w http.ResponseWriter, r *http.Request, u user) error {
	if err := a.rateLimit(r, "upload", 20); err != nil {
		return err
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		return problem(415, "Envía el formulario con su documento adjunto.")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10600000)
	if err := r.ParseMultipartForm(10600000); err != nil {
		return problem(400, "Envía un solo PDF de hasta 10 MB y los campos del formulario.")
	}
	defer r.MultipartForm.RemoveAll()
	input, pdf, err := parseProject(r)
	if err != nil {
		return err
	}
	id := 0
	if r.Method == "PUT" {
		id, err = idOf(r)
		if err != nil {
			return err
		}
	} else if pdf == nil {
		return problem(400, "Adjunta el documento PDF de tu proyecto.")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	committed := false
	newPath := ""
	defer func() {
		if !committed && newPath != "" {
			_ = os.Remove(newPath)
		}
	}()
	if id > 0 {
		var status string
		if err = tx.QueryRow(r.Context(), "SELECT status FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE", id, u.ID).Scan(&status); err != nil {
			return problem(404, "Proyecto no encontrado.")
		}
		if status != "observed" {
			return problem(409, "Solo puedes corregir proyectos observados.")
		}
	}
	var category int
	if err = tx.QueryRow(r.Context(), "SELECT id FROM categories WHERE id=$1 AND active=true", input.CategoryID).Scan(&category); err != nil {
		return problem(400, "Selecciona una categoría activa.")
	}
	values := []any{input.Title, input.Summary, input.Objectives, input.Authors, input.Year, input.CategoryID}
	if id == 0 {
		err = tx.QueryRow(r.Context(), "INSERT INTO projects(title,summary,objectives,authors,year,category_id,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", append(values, u.ID)...).Scan(&id)
	} else {
		_, err = tx.Exec(r.Context(), "UPDATE projects SET title=$1,summary=$2,objectives=$3,authors=$4,year=$5,category_id=$6,status='pending',observations='',reviewed_by=NULL,published_at=NULL,updated_at=now() WHERE id=$7 AND owner_id=$8", append(values, id, u.ID)...)
	}
	if err != nil {
		return err
	}
	if pdf != nil {
		oldKeys, err := queryMaps(r.Context(), tx, "SELECT storage_key FROM documents WHERE project_id=$1", id)
		if err != nil {
			return err
		}
		raw := randomHex(16)
		key := fmt.Sprintf("%s-%s-%s-%s-%s.pdf", raw[:8], raw[8:12], raw[12:16], raw[16:20], raw[20:])
		if err = os.MkdirAll(a.uploads, 0700); err != nil {
			return err
		}
		newPath, _ = a.documentPath(key)
		f, err := os.OpenFile(newPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return err
		}
		_, err = f.Write(pdf.Data)
		closeErr := f.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
		_, err = tx.Exec(r.Context(), "INSERT INTO documents(project_id,original_name,storage_key,mime_type,size_bytes) VALUES($1,$2,$3,'application/pdf',$4) ON CONFLICT(project_id) DO UPDATE SET original_name=EXCLUDED.original_name,storage_key=EXCLUDED.storage_key,size_bytes=EXCLUDED.size_bytes,created_at=now()", id, pdf.Name, key, len(pdf.Data))
		if err != nil {
			return err
		}
		if len(oldKeys) > 0 {
			_, err = tx.Exec(r.Context(), "INSERT INTO pending_file_deletions(storage_key) VALUES($1) ON CONFLICT DO NOTHING", oldKeys[0]["storage_key"])
			if err != nil {
				return err
			}
		}
	} else {
		var exists bool
		err = tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM documents WHERE project_id=$1)", id).Scan(&exists)
		if err != nil {
			return err
		}
		if !exists {
			return problem(400, "Adjunta un documento PDF.")
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	committed = true
	code := 200
	if r.Method == "POST" {
		code = 201
	}
	jsonResponse(w, code, map[string]any{"id": id, "message": "Tu proyecto fue enviado a revisión."})
	return nil
}
func fileExists(path string) bool { stat, err := os.Stat(path); return err == nil && !stat.IsDir() }
func isMissing(err error) bool    { return errors.Is(err, os.ErrNotExist) }
