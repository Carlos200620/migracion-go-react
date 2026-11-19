package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func improvedFixture(t *testing.T) (*app, int, int) {
	t.Helper()
	if os.Getenv("MIGRATION_DB_TEST") != "1" {
		t.Skip("Requiere PostgreSQL: npm run test:database")
	}
	_ = godotenv.Load()
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns = 1
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 0
	db, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	ctx := context.Background()
	counts := map[string]int64{}
	tables := []string{"users", "categories", "projects", "documents", "project_events", "pending_file_deletions", "user_sessions", "password_resets", "notifications"}
	for _, table := range tables {
		var count int64
		if err = db.QueryRow(ctx, "SELECT count(*) FROM public."+table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		counts[table] = count
		if _, err = db.Exec(ctx, "CREATE TEMP TABLE "+table+" (LIKE public."+table+" INCLUDING ALL)"); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		for table, before := range counts {
			var after int64
			if err := db.QueryRow(ctx, "SELECT count(*) FROM public."+table).Scan(&after); err != nil || after != before {
				t.Errorf("Cambió tabla pública: %s", table)
			}
		}
	})
	for _, table := range tables {
		var temporary bool
		err = db.QueryRow(ctx, "SELECT relpersistence='t' FROM pg_class WHERE oid=$1::regclass", table).Scan(&temporary)
		if err != nil || !temporary {
			t.Fatal("La prueba no está aislada")
		}
	}
	_, err = db.Exec(ctx, "ALTER TABLE documents ADD FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE")
	if err != nil {
		t.Fatal(err)
	}
	hash, _ := hashPassword("Prueba-segura-123")
	var student, admin int
	if err = db.QueryRow(ctx, "INSERT INTO users(full_name,email,password_hash,role) VALUES('Estudiante','student@test.invalid',$1,'student') RETURNING id", hash).Scan(&student); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(ctx, "INSERT INTO users(full_name,email,password_hash,role) VALUES('Administrador','admin@test.invalid',$1,'admin') RETURNING id", hash).Scan(&admin); err != nil {
		t.Fatal(err)
	}
	a := &app{db: db, uploads: t.TempDir(), origin: "http://localhost:4200", rates: map[string]rateEntry{}, dummyHash: hash}
	return a, student, admin
}

type testWeb struct {
	t      *testing.T
	server *httptest.Server
	client *http.Client
}

func webFor(t *testing.T, a *app) *testWeb {
	server := httptest.NewServer(a.routes())
	t.Cleanup(server.Close)
	jar, _ := cookiejar.New(nil)
	return &testWeb{t, server, &http.Client{Jar: jar}}
}
func (w *testWeb) call(method, path string, body any, status int) map[string]any {
	w.t.Helper()
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = strings.NewReader(string(b))
	}
	req, _ := http.NewRequest(method, w.server.URL+path, reader)
	req.Header.Set("Origin", "http://localhost:4200")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := w.client.Do(req)
	if err != nil {
		w.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode != status {
		w.t.Fatalf("%s %s: %d esperado %d: %s", method, path, res.StatusCode, status, data)
	}
	var value map[string]any
	if err = json.Unmarshal(data, &value); err != nil {
		w.t.Fatal(err)
	}
	return value
}
func (w *testWeb) login(email string) {
	w.t.Helper()
	w.call("POST", "/api/auth/login", map[string]string{"email": email, "password": "Prueba-segura-123"}, 200)
}

type fakeResetMailer struct{ links chan string }

func (m *fakeResetMailer) SendReset(ctx context.Context, to, link string) error {
	select {
	case m.links <- link:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (m *fakeResetMailer) token(t *testing.T) string {
	t.Helper()
	select {
	case link := <-m.links:
		u, err := url.Parse(link)
		if err != nil {
			t.Fatal(err)
		}
		if u.RawQuery != "" {
			t.Fatal("El token no debe ir en query string")
		}
		values, _ := url.ParseQuery(u.Fragment)
		return values.Get("token")
	case <-time.After(3 * time.Second):
		t.Fatal("No se generó el correo")
		return ""
	}
}

func TestPersistentSessionsAndPasswordRecovery(t *testing.T) {
	a, student, _ := improvedFixture(t)
	mailer := &fakeResetMailer{make(chan string, 10)}
	a.mailer = mailer
	web := webFor(t, a)
	web.login("student@test.invalid")
	parsed, _ := url.Parse(web.server.URL + "/api")
	cookie := web.client.Jar.Cookies(parsed)[0]
	var hash string
	if err := a.db.QueryRow(context.Background(), "SELECT token_hash FROM user_sessions WHERE user_id=$1", student).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if hash == cookie.Value || hash != tokenHash(cookie.Value) {
		t.Fatal("La sesión no está protegida con hash")
	}
	restarted := &app{db: a.db, uploads: a.uploads, origin: a.origin, rates: map[string]rateEntry{}, dummyHash: a.dummyHash, mailer: mailer}
	next := webFor(t, restarted)
	next.client.Jar = web.client.Jar
	next.call("GET", "/api/auth/me", nil, 200)
	next.call("POST", "/api/auth/forgot-password", map[string]string{"email": "student@test.invalid"}, 200)
	old := mailer.token(t)
	generic := next.call("POST", "/api/auth/forgot-password", map[string]string{"email": "unknown@test.invalid"}, 200)
	if _, ok := generic["token"]; ok {
		t.Fatal("Se expuso un token")
	}
	if len(mailer.links) != 0 {
		t.Fatal("Correo enviado para una cuenta inexistente")
	}
	next.call("POST", "/api/auth/forgot-password", map[string]string{"email": "student@test.invalid"}, 200)
	token := mailer.token(t)
	next.call("POST", "/api/auth/reset-password", map[string]string{"token": old, "password": "Nueva-segura-456"}, 400)
	next.call("POST", "/api/auth/reset-password", map[string]string{"token": token, "password": "corta"}, 400)
	next.call("POST", "/api/auth/reset-password", map[string]string{"token": token, "password": "Nueva-segura-456"}, 200)
	next.call("POST", "/api/auth/reset-password", map[string]string{"token": token, "password": "Otra-segura-456"}, 400)
	web.call("GET", "/api/auth/me", nil, 401)
	next.call("POST", "/api/auth/login", map[string]string{"email": "student@test.invalid", "password": "Prueba-segura-123"}, 401)
	next.call("POST", "/api/auth/login", map[string]string{"email": "student@test.invalid", "password": "Nueva-segura-456"}, 200)
	_, _ = a.db.Exec(context.Background(), "UPDATE user_sessions SET expires_at=now()-interval '1 second'")
	next.call("GET", "/api/auth/me", nil, 401)
	_, _ = a.db.Exec(context.Background(), "UPDATE password_resets SET used_at=NULL,expires_at=now()-interval '1 second'")
	next.call("POST", "/api/auth/reset-password", map[string]string{"token": token, "password": "Nueva-segura-456"}, 400)
	a.mailer = nil
	web.call("POST", "/api/auth/forgot-password", map[string]string{"email": "student@test.invalid"}, 503)
}

func TestServerPaginationAndFilters(t *testing.T) {
	a, student, admin := improvedFixture(t)
	ctx := context.Background()
	var category int
	if err := a.db.QueryRow(ctx, "INSERT INTO categories(name,description) VALUES('Física','Prueba') RETURNING id").Scan(&category); err != nil {
		t.Fatal(err)
	}
	_, err := a.db.Exec(ctx, "INSERT INTO projects(owner_id,category_id,title,summary,objectives,authors,year,status,reviewed_by,published_at) SELECT $1,$2,'Informe '||i,'energía y átomos','Objetivos','Autor',CASE WHEN i%2=0 THEN 2025 ELSE 2026 END,'approved',$3,now() FROM generate_series(1,205) AS i", student, category, admin)
	if err != nil {
		t.Fatal(err)
	}
	web := webFor(t, a)
	first := web.call("GET", "/api/projects?page=1&pageSize=12&q=energia&category="+url.QueryEscape("Física"), nil, 200)
	if first["total"] != float64(205) || len(first["items"].([]any)) != 12 {
		t.Fatal("No consulta más allá del límite anterior de 200")
	}
	last := web.call("GET", "/api/projects?page=18&pageSize=12", nil, 200)
	if len(last["items"].([]any)) != 1 {
		t.Fatal("Última página incorrecta")
	}
	byYear := web.call("GET", "/api/projects?year=2025", nil, 200)
	if byYear["total"] != float64(102) {
		t.Fatal("Filtro de año incorrecto")
	}
	none := web.call("GET", "/api/projects?q=%27%20OR%201=1--", nil, 200)
	if none["total"] != float64(0) {
		t.Fatal("Búsqueda no tratada como texto literal")
	}
	web.call("GET", "/api/projects?page=0", nil, 400)
	web.call("GET", "/api/projects?pageSize=100", nil, 400)
	web.call("GET", "/api/projects?year=abc", nil, 400)
	web.call("GET", "/api/projects?from=2026-12-30&to=2026-01-01", nil, 400)
	web.login("student@test.invalid")
	mine := web.call("GET", "/api/student/projects?page=2&pageSize=5&status=approved", nil, 200)
	if mine["total"] != float64(205) || len(mine["items"].([]any)) != 5 {
		t.Fatal("Paginación estudiantil incorrecta")
	}
	web.call("GET", "/api/admin/projects", nil, 403)
	_, err = a.db.Exec(ctx, "INSERT INTO users(full_name,email,password_hash,role) VALUES('Otro','other@test.invalid',$1,'student')", a.dummyHash)
	if err != nil {
		t.Fatal(err)
	}
	web.login("other@test.invalid")
	other := web.call("GET", "/api/student/projects", nil, 200)
	if other["total"] != float64(0) {
		t.Fatal("Se expusieron proyectos ajenos")
	}
}

func TestNotificationsAndInlinePDF(t *testing.T) {
	a, student, admin := improvedFixture(t)
	ctx := context.Background()
	var category, id int
	_ = a.db.QueryRow(ctx, "INSERT INTO categories(name) VALUES('Software') RETURNING id").Scan(&category)
	err := a.db.QueryRow(ctx, "INSERT INTO projects(owner_id,category_id,title,summary,objectives,authors,year) VALUES($1,$2,'Proyecto de avisos','Resumen','Objetivos','Autor',2026) RETURNING id", student, category).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	key := "01234567-89ab-cdef-0123-456789abcdef.pdf"
	pdf := []byte("%PDF-1.4\nDocumento\n%%EOF")
	if err = os.WriteFile(filepath.Join(a.uploads, key), pdf, 0600); err != nil {
		t.Fatal(err)
	}
	_, err = a.db.Exec(ctx, "INSERT INTO documents(project_id,original_name,storage_key,mime_type,size_bytes) VALUES($1,'informe.pdf',$2,'application/pdf',$3)", id, key, len(pdf))
	if err != nil {
		t.Fatal(err)
	}
	adminWeb := webFor(t, a)
	adminWeb.login("admin@test.invalid")
	studentWeb := webFor(t, a)
	studentWeb.login("student@test.invalid")
	path := fmt.Sprintf("/api/admin/projects/%d", id)
	p := adminWeb.call("GET", path, nil, 200)
	adminWeb.call("POST", path+"/review", map[string]any{"decision": "approved", "version": p["version"]}, 200)
	notices := studentWeb.call("GET", "/api/notifications", nil, 200)
	if notices["unread"] != float64(1) {
		t.Fatal("No se notificó la aprobación")
	}
	noticeID := int(notices["items"].([]any)[0].(map[string]any)["id"].(float64))
	adminWeb.call("PATCH", fmt.Sprintf("/api/notifications/%d/read", noticeID), map[string]any{}, 404)
	studentWeb.call("PATCH", fmt.Sprintf("/api/notifications/%d/read", noticeID), map[string]any{}, 200)
	response, err := studentWeb.client.Get(studentWeb.server.URL + fmt.Sprintf("/api/student/projects/%d/document?inline=1", id))
	if err != nil {
		t.Fatal(err)
	}
	bytes, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 200 || !strings.HasPrefix(response.Header.Get("Content-Disposition"), "inline") || string(bytes) != string(pdf) {
		t.Fatal("Vista previa no conserva los bytes o permisos")
	}
	p = adminWeb.call("GET", path, nil, 200)
	adminWeb.call("POST", path+"/lifecycle", map[string]any{"action": "withdraw", "reason": "Retiro temporal", "version": p["version"]}, 200)
	public := webFor(t, a)
	public.call("GET", fmt.Sprintf("/api/projects/%d/document?inline=1", id), nil, 404)
	notices = studentWeb.call("GET", "/api/notifications", nil, 200)
	if notices["unread"] != float64(1) || notices["total"] != float64(2) {
		t.Fatal("Estado de lectura incorrecto")
	}
	studentWeb.call("PATCH", "/api/notifications/read-all", map[string]any{}, 200)
	notices = studentWeb.call("GET", "/api/notifications", nil, 200)
	if notices["unread"] != float64(0) {
		t.Fatal("No se marcaron los avisos")
	}
	_ = admin
}

func TestRecoveryCodes(t *testing.T) {
	a, student, _ := improvedFixture(t)
	ctx := context.Background()
	a.recoverySecret = strings.Repeat("secret", 12)
	mailer := &fakeResetMailer{make(chan string, 10)}
	a.mailer = mailer
	web := webFor(t, a)
	web.login("student@test.invalid")
	request := func() {
		web.call("POST", "/api/auth/request-code", map[string]string{"email": "student@test.invalid"}, 200)
	}
	receive := func() string {
		select {
		case code := <-mailer.links:
			if !codePattern.MatchString(code) {
				t.Fatal("Código incorrecto")
			}
			return code
		case <-time.After(3 * time.Second):
			t.Fatal("No se generó el código")
			return ""
		}
	}
	reset := func(code string, status int) {
		web.call("POST", "/api/auth/reset-with-code", map[string]string{"email": "student@test.invalid", "code": code, "password": "Nueva-segura-456"}, status)
	}
	request()
	code := receive()
	var hash string
	var lifetime bool
	if err := a.db.QueryRow(ctx, "SELECT token_hash,expires_at>now()+interval '9 minutes' FROM password_resets WHERE user_id=$1", student).Scan(&hash, &lifetime); err != nil {
		t.Fatal(err)
	}
	if hash == code || hash != a.codeHash(student, code) || !lifetime {
		t.Fatal("Código sin protección o caducidad incorrecta")
	}
	request()
	if len(mailer.links) != 0 {
		t.Fatal("No respetó los sesenta segundos")
	}
	web.call("POST", "/api/auth/request-code", map[string]string{"email": "unknown@test.invalid"}, 200)
	if len(mailer.links) != 0 {
		t.Fatal("Envió a un correo inexistente")
	}
	wrong := "00000000"
	if code == wrong {
		wrong = "11111111"
	}
	for i := 0; i < 5; i++ {
		reset(wrong, 400)
	}
	reset(code, 400)
	if _, err := a.db.Exec(ctx, "UPDATE password_resets SET created_at=now()-interval '61 seconds'"); err != nil {
		t.Fatal(err)
	}
	request()
	code = receive()
	if _, err := a.db.Exec(ctx, "UPDATE password_resets SET expires_at=now()-interval '1 second'"); err != nil {
		t.Fatal(err)
	}
	reset(code, 400)
	if _, err := a.db.Exec(ctx, "UPDATE password_resets SET expires_at=now()+interval '10 minutes'"); err != nil {
		t.Fatal(err)
	}
	reset(code, 200)
	reset(code, 400)
	web.call("GET", "/api/auth/me", nil, 401)
	web.call("POST", "/api/auth/login", map[string]string{"email": "student@test.invalid", "password": "Nueva-segura-456"}, 200)
}
