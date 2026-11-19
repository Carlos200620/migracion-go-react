package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func TestPasswordAndPDF(t *testing.T) {
	// Vector generado con crypto.scryptSync de Node.js: conserva las cuentas existentes.
	const nodeHash = "scrypt$0123456789abcdef0123456789abcdef$7e63eada5c5d6cbc58f90fd6f4a79e0c66f3c43314115b520c4223024f6d4392e120ad0468b8cd768b38cc8ffd72b40da3c2b1efddc8a14d97dbf42b29a355d0"
	if !verifyPassword("Compatibilidad-2026", nodeHash) {
		t.Fatal("No es compatible con las contraseñas de Node.js")
	}
	hash, err := hashPassword("Migracion-segura-2026")
	if err != nil {
		t.Fatal(err)
	}
	if !verifyPassword("Migracion-segura-2026", hash) || verifyPassword("incorrecta", hash) {
		t.Fatal("Verificación de contraseña incorrecta")
	}
	for _, bad := range []string{"", "scrypt$a$b", "bcrypt$bad"} {
		if verifyPassword("x", bad) {
			t.Fatal("Aceptó hash inválido")
		}
	}
	if validatePDF([]byte("no es pdf")) == nil {
		t.Fatal("Aceptó archivo no PDF")
	}
	if validatePDF([]byte("%PDF-1.4\n%%EOF")) != nil {
		t.Fatal("Rechazó cabecera y cierre PDF")
	}
	a := &app{uploads: t.TempDir()}
	if _, err = a.documentPath("../.env"); err == nil {
		t.Fatal("Aceptó recorrido de rutas")
	}
}

func TestMigrationPostgresFlow(t *testing.T) {
	if os.Getenv("MIGRATION_DB_TEST") != "1" {
		t.Skip("Activa MIGRATION_DB_TEST=1 para probar con tablas temporales PostgreSQL")
	}
	_ = godotenv.Load()
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns = 1
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 0
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tables := []string{"users", "categories", "projects", "documents", "project_events", "pending_file_deletions", "user_sessions", "password_resets", "notifications"}
	before := map[string]int64{}
	for _, table := range tables {
		var n int64
		if err = pool.QueryRow(ctx, "SELECT count(*) FROM public."+table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		before[table] = n
		if _, err = pool.Exec(ctx, "CREATE TEMP TABLE "+table+" (LIKE public."+table+" INCLUDING ALL)"); err != nil {
			t.Fatal(err)
		}
	}
	for _, table := range tables {
		var isTemp bool
		err = pool.QueryRow(ctx, "SELECT relpersistence='t' FROM pg_class WHERE oid=$1::regclass", table).Scan(&isTemp)
		if err != nil || !isTemp {
			t.Fatalf("Tabla %s no es temporal", table)
		}
	}
	defer func() {
		for _, table := range tables {
			var n int64
			err := pool.QueryRow(ctx, "SELECT count(*) FROM public."+table).Scan(&n)
			if err != nil || n != before[table] {
				t.Errorf("Cambió tabla real %s", table)
			}
		}
	}()
	if _, err = pool.Exec(ctx, "ALTER TABLE documents ADD CONSTRAINT test_document_project_fk FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE"); err != nil {
		t.Fatal(err)
	}
	upload := t.TempDir()
	dummy, _ := hashPassword("contraseña-ficticia")
	a := &app{db: pool, uploads: upload, origin: "http://localhost:4200", rates: map[string]rateEntry{}, dummyHash: dummy}
	server := httptest.NewServer(a.routes())
	defer server.Close()
	client := func() *http.Client { jar, _ := cookiejar.New(nil); return &http.Client{Jar: jar} }
	student, admin, other, anon := client(), client(), client(), client()
	request := func(c *http.Client, method, path string, body any, want int) map[string]any {
		t.Helper()
		var reader io.Reader
		if body != nil {
			data, _ := json.Marshal(body)
			reader = bytes.NewReader(data)
		}
		req, _ := http.NewRequest(method, server.URL+path, reader)
		req.Header.Set("Origin", a.origin)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		res, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, _ := io.ReadAll(res.Body)
		if res.StatusCode != want {
			t.Fatalf("%s %s: %d, esperado %d: %s", method, path, res.StatusCode, want, data)
		}
		var result map[string]any
		_ = json.Unmarshal(data, &result)
		return result
	}
	request(anon, "GET", "/api/admin/projects", nil, 401)
	request(student, "POST", "/api/auth/register", map[string]any{"fullName": "Estudiante de prueba", "email": "student@test.invalid", "password": "Prueba-segura-123"}, 201)
	request(student, "POST", "/api/auth/register", map[string]any{"fullName": "Duplicado", "email": "student@test.invalid", "password": "Prueba-segura-123"}, 409)
	request(student, "POST", "/api/auth/login", map[string]any{"email": "student@test.invalid", "password": "incorrecta"}, 401)
	request(student, "POST", "/api/auth/login", map[string]any{"email": "student@test.invalid", "password": "Prueba-segura-123"}, 200)
	request(student, "GET", "/api/admin/projects", nil, 403)
	hash, _ := hashPassword("Admin-seguro-123")
	_, err = pool.Exec(ctx, "INSERT INTO users(full_name,email,password_hash,role) VALUES('Admin de prueba','admin@test.invalid',$1,'admin')", hash)
	if err != nil {
		t.Fatal(err)
	}
	request(admin, "POST", "/api/auth/login", map[string]any{"email": "admin@test.invalid", "password": "Admin-seguro-123"}, 200)
	request(admin, "GET", "/api/student/projects", nil, 403)
	category := request(admin, "POST", "/api/admin/categories", map[string]any{"name": "Categoría de prueba", "description": "Migración", "active": true}, 201)
	categoryID := int(category["id"].(float64))
	request(admin, "POST", "/api/admin/categories", map[string]any{"name": "CATEGORÍA DE PRUEBA", "active": true}, 409)
	request(admin, "PATCH", fmt.Sprintf("/api/admin/categories/%d/status", categoryID), map[string]any{"active": false}, 200)
	pdf := []byte("%PDF-1.4\nDocumento de prueba de migración\n%%EOF")
	uploadProject := func(method, path string, document []byte, want int) map[string]any {
		t.Helper()
		var body bytes.Buffer
		form := multipart.NewWriter(&body)
		for key, value := range map[string]string{"title": "Proyecto temporal", "summary": "Resumen de prueba", "objectives": "Comprobar el flujo", "authors": "Estudiante de prueba", "year": "2026", "categoryId": fmt.Sprint(categoryID)} {
			_ = form.WriteField(key, value)
		}
		if document != nil {
			header := textproto.MIMEHeader{}
			header.Set("Content-Disposition", `form-data; name="document"; filename="prueba.pdf"`)
			header.Set("Content-Type", "application/pdf")
			part, _ := form.CreatePart(header)
			_, _ = part.Write(document)
		}
		_ = form.Close()
		req, _ := http.NewRequest(method, server.URL+path, &body)
		req.Header.Set("Content-Type", form.FormDataContentType())
		req.Header.Set("Origin", a.origin)
		res, err := student.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, _ := io.ReadAll(res.Body)
		if res.StatusCode != want {
			t.Fatalf("Carga PDF: %d esperado %d: %s", res.StatusCode, want, data)
		}
		var result map[string]any
		_ = json.Unmarshal(data, &result)
		return result
	}
	uploadProject("POST", "/api/student/projects", pdf, 400)
	request(admin, "PATCH", fmt.Sprintf("/api/admin/categories/%d/status", categoryID), map[string]any{"active": true}, 200)
	uploadProject("POST", "/api/student/projects", []byte("Falso PDF"), 400)
	created := uploadProject("POST", "/api/student/projects", pdf, 201)
	id := int(created["id"].(float64))
	path := fmt.Sprintf("/api/admin/projects/%d", id)
	public := fmt.Sprintf("/api/projects/%d", id)
	studentPath := fmt.Sprintf("/api/student/projects/%d", id)
	request(anon, "GET", public, nil, 404)
	request(other, "POST", "/api/auth/register", map[string]any{"fullName": "Otro estudiante", "email": "other@test.invalid", "password": "Prueba-segura-123"}, 201)
	request(other, "POST", "/api/auth/login", map[string]any{"email": "other@test.invalid", "password": "Prueba-segura-123"}, 200)
	request(other, "GET", studentPath, nil, 404)
	request(other, "GET", studentPath+"/document", nil, 404)
	p := request(admin, "GET", path, nil, 200)
	request(admin, "POST", path+"/review", map[string]any{"decision": "observed", "observations": "", "version": p["version"]}, 400)
	request(admin, "POST", path+"/review", map[string]any{"decision": "observed", "observations": "Corregir resumen", "version": p["version"]}, 200)
	uploadProject("PUT", studentPath, nil, 200)
	p = request(admin, "GET", path, nil, 200)
	request(admin, "POST", path+"/review", map[string]any{"decision": "approved", "version": "versión anterior"}, 409)
	request(admin, "POST", path+"/review", map[string]any{"decision": "approved", "version": p["version"]}, 200)
	request(anon, "GET", public, nil, 200)
	res, err := anon.Get(server.URL + public + "/document")
	if err != nil {
		t.Fatal(err)
	}
	download, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || !bytes.Equal(download, pdf) {
		t.Fatal("PDF descargado distinto al original")
	}
	uploadProject("PUT", studentPath, nil, 409)
	p = request(admin, "GET", path, nil, 200)
	request(admin, "POST", path+"/lifecycle", map[string]any{"action": "withdraw", "reason": "Prueba", "version": p["version"]}, 200)
	request(anon, "GET", public, nil, 404)
	request(anon, "GET", public+"/document", nil, 404)
	p = request(admin, "GET", path, nil, 200)
	request(admin, "POST", path+"/lifecycle", map[string]any{"action": "restore", "reason": "Prueba", "version": p["version"]}, 200)
	request(anon, "GET", public, nil, 200)
	p = request(admin, "GET", path, nil, 200)
	request(admin, "POST", path+"/lifecycle", map[string]any{"action": "delete", "reason": "Limpiar prueba", "version": p["version"], "confirmation": "incorrecto"}, 400)
	request(admin, "POST", path+"/lifecycle", map[string]any{"action": "delete", "reason": "Limpiar prueba", "version": p["version"], "confirmation": "Proyecto temporal"}, 200)
	request(admin, "GET", path, nil, 404)
	var events, jobs int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM project_events WHERE project_id=$1", id).Scan(&events); err != nil || events != 3 {
		t.Fatal("No se conservaron los eventos")
	}
	_ = pool.QueryRow(ctx, "SELECT count(*) FROM pending_file_deletions").Scan(&jobs)
	if jobs != 0 {
		t.Fatal("Quedó un PDF pendiente")
	}
	files, _ := os.ReadDir(upload)
	if len(files) != 0 {
		t.Fatal("No se eliminó el PDF temporal")
	}
	request(student, "POST", "/api/auth/logout", map[string]any{}, 200)
	request(student, "GET", "/api/student/projects", nil, 401)
	t.Log("Recorrido registro → envío PDF → observación → corrección → aprobación → descarga idéntica → retiro → restauración → eliminación completado en tablas temporales.")
}

func TestOriginAndJSON(t *testing.T) {
	a := &app{origin: "http://localhost:4200", rates: map[string]rateEntry{}}
	for _, tc := range []struct {
		origin, content, body string
		want                  int
	}{{"http://evil.invalid", "application/json", "{}", 403}, {"http://localhost:4200", "text/plain", "{}", 415}, {"http://localhost:4200", "application/json", "{", 400}} {
		r := httptest.NewRequest("POST", "/api/auth/logout", strings.NewReader(tc.body))
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Content-Type", tc.content)
		w := httptest.NewRecorder()
		a.routes().ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Fatalf("Seguridad: %d esperado %d", w.Code, tc.want)
		}
	}
	_ = filepath.Separator
}
