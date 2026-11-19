package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type apiError struct {
	Status  int
	Message string
}

func (e *apiError) Error() string            { return e.Message }
func problem(code int, message string) error { return &apiError{code, message} }

type user struct {
	ID       int    `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Hash     string `json:"-"`
}
type rateEntry struct {
	Count   int
	Expires time.Time
}
type app struct {
	db             *pgxpool.Pool
	uploads        string
	origin         string
	secure         bool
	mu             sync.Mutex
	rates          map[string]rateEntry
	dummyHash      string
	mailer         resetMailer
	recoverySecret string
}
type handler func(http.ResponseWriter, *http.Request) error

func jsonResponse(w http.ResponseWriter, code int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(data)
}
func (a *app) wrap(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		defer func() {
			if recover() != nil {
				jsonResponse(w, 500, map[string]string{"message": "No se pudo completar la operación."})
			}
		}()
		if r.Method != "GET" && r.Method != "HEAD" {
			origin := r.Header.Get("Origin")
			if origin != "" && origin != a.origin && origin != "http://127.0.0.1:4200" {
				jsonResponse(w, 403, map[string]string{"message": "Origen no permitido."})
				return
			}
		}
		if err := h(w, r); err != nil {
			status, message := 503, "No se pudo completar la operación. Comprueba la conexión con PostgreSQL."
			var ae *apiError
			var pe *pgconn.PgError
			if errors.As(err, &ae) {
				status, message = ae.Status, ae.Message
			} else if errors.As(err, &pe) && pe.Code == "23505" {
				status, message = 409, "Ya existe un registro con ese nombre o correo."
			}
			if status >= 500 {
				log.Printf("Operación fallida: %s %s (%T)", r.Method, r.URL.Path, err)
			}
			jsonResponse(w, status, map[string]string{"message": message})
		}
	}
}
func decode(w http.ResponseWriter, r *http.Request, dest any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return problem(415, "Se requiere JSON.")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dest); err != nil {
		return problem(400, "El contenido JSON no es válido.")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return problem(400, "Envía un solo objeto JSON.")
	}
	return nil
}
func idOf(r *http.Request) (int, error) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		return 0, problem(400, "Identificador no válido.")
	}
	return id, nil
}

type querier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func queryMaps(ctx context.Context, db querier, sql string, args ...any) ([]map[string]any, error) {
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		v, err := rows.Values()
		if err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, f := range rows.FieldDescriptions() {
			m[f.Name] = v[i]
		}
		result = append(result, m)
	}
	return result, rows.Err()
}
func queryMap(ctx context.Context, db querier, sql string, args ...any) (map[string]any, error) {
	rows, err := queryMaps(ctx, db, sql, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, problem(404, "Proyecto o categoría no encontrado.")
	}
	return rows[0], nil
}
func (a *app) protected(role string, h func(http.ResponseWriter, *http.Request, user) error) handler {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, err := a.currentUser(r)
		if err != nil {
			return err
		}
		if u.Role != role {
			return problem(403, "Tu perfil no tiene permiso para esta operación.")
		}
		return h(w, r, u)
	}
}
func (a *app) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.wrap(func(w http.ResponseWriter, r *http.Request) error {
		jsonResponse(w, 200, map[string]string{"status": "ok", "service": "repositorio-api-go"})
		return nil
	}))
	mux.HandleFunc("GET /api/health/database", a.wrap(func(w http.ResponseWriter, r *http.Request) error {
		if err := a.db.Ping(r.Context()); err != nil {
			return err
		}
		jsonResponse(w, 200, map[string]string{"status": "ok", "database": "connected"})
		return nil
	}))
	mux.HandleFunc("POST /api/auth/register", a.wrap(a.register))
	mux.HandleFunc("POST /api/auth/login", a.wrap(a.login))
	mux.HandleFunc("POST /api/auth/logout", a.wrap(a.logout))
	mux.HandleFunc("POST /api/auth/request-code", a.wrap(a.requestResetCode))
	mux.HandleFunc("POST /api/auth/reset-with-code", a.wrap(a.resetWithCode))
	mux.HandleFunc("POST /api/auth/forgot-password", a.wrap(a.forgotPassword))
	mux.HandleFunc("POST /api/auth/reset-password", a.wrap(a.resetPassword))
	mux.HandleFunc("GET /api/auth/recovery-status", a.wrap(a.recoveryStatus))
	mux.HandleFunc("GET /api/notifications", a.wrap(a.notifications))
	mux.HandleFunc("PATCH /api/notifications/read-all", a.wrap(a.readAllNotifications))
	mux.HandleFunc("PATCH /api/notifications/{id}/read", a.wrap(a.readNotification))
	mux.HandleFunc("GET /api/auth/me", a.wrap(func(w http.ResponseWriter, r *http.Request) error {
		u, err := a.currentUser(r)
		if err != nil {
			return err
		}
		jsonResponse(w, 200, map[string]any{"user": u})
		return nil
	}))
	mux.HandleFunc("GET /api/projects", a.wrap(a.publicProjects))
	mux.HandleFunc("GET /api/projects/filters", a.wrap(a.projectFilters))
	mux.HandleFunc("GET /api/admin/project-filters", a.wrap(a.protected("admin", a.adminProjectFilters)))
	mux.HandleFunc("GET /api/projects/{id}", a.wrap(a.publicProject))
	mux.HandleFunc("GET /api/projects/{id}/document", a.wrap(a.publicDocument))
	mux.HandleFunc("GET /api/categories", a.wrap(func(w http.ResponseWriter, r *http.Request) error {
		v, err := queryMaps(r.Context(), a.db, "SELECT id,name,description FROM categories WHERE active=true ORDER BY name")
		if err != nil {
			return err
		}
		jsonResponse(w, 200, v)
		return nil
	}))
	mux.HandleFunc("GET /api/student/projects", a.wrap(a.protected("student", a.studentList)))
	mux.HandleFunc("GET /api/student/projects/{id}", a.wrap(a.protected("student", a.studentDetail)))
	mux.HandleFunc("GET /api/student/projects/{id}/document", a.wrap(a.protected("student", a.studentDocument)))
	mux.HandleFunc("POST /api/student/projects", a.wrap(a.protected("student", a.studentSave)))
	mux.HandleFunc("PUT /api/student/projects/{id}", a.wrap(a.protected("student", a.studentSave)))
	mux.HandleFunc("GET /api/admin/summary", a.wrap(a.protected("admin", a.summary)))
	mux.HandleFunc("GET /api/admin/projects", a.wrap(a.protected("admin", a.adminList)))
	mux.HandleFunc("GET /api/admin/projects/{id}", a.wrap(a.protected("admin", a.adminDetail)))
	mux.HandleFunc("GET /api/admin/projects/{id}/document", a.wrap(a.protected("admin", a.adminDocument)))
	mux.HandleFunc("GET /api/admin/projects/{id}/history", a.wrap(a.protected("admin", a.history)))
	mux.HandleFunc("POST /api/admin/projects/{id}/review", a.wrap(a.protected("admin", a.review)))
	mux.HandleFunc("POST /api/admin/projects/{id}/lifecycle", a.wrap(a.protected("admin", a.lifecycle)))
	mux.HandleFunc("GET /api/admin/categories", a.wrap(a.protected("admin", a.categories)))
	mux.HandleFunc("POST /api/admin/categories", a.wrap(a.protected("admin", a.saveCategory)))
	mux.HandleFunc("PUT /api/admin/categories/{id}", a.wrap(a.protected("admin", a.saveCategory)))
	mux.HandleFunc("PATCH /api/admin/categories/{id}/status", a.wrap(a.protected("admin", a.categoryStatus)))
	mux.HandleFunc("/api/", a.wrap(func(w http.ResponseWriter, r *http.Request) error { return problem(404, "Ruta no encontrada.") }))
	return mux
}
func main() {
	_ = godotenv.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	config, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Configuración PostgreSQL no válida.")
	}
	config.MaxConns = 5
	config.ConnConfig.ConnectTimeout = 5 * time.Second
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatal("No se pudo preparar PostgreSQL.")
	}
	defer db.Close()
	uploads := os.Getenv("UPLOADS_DIR")
	if uploads == "" {
		uploads = "uploads"
	}
	uploads, _ = filepath.Abs(uploads)
	origin := os.Getenv("APP_ORIGIN")
	if origin == "" {
		origin = "http://localhost:4200"
	}
	dummy, _ := hashPassword(randomHex(32))
	a := &app{db: db, uploads: uploads, origin: origin, secure: os.Getenv("NODE_ENV") == "production", rates: map[string]rateEntry{}, dummyHash: dummy}
	a.mailer = smtpMailerFromEnv()
	a.recoverySecret = os.Getenv("RECOVERY_CODE_SECRET")
	schemaCtx, schemaCancel := schemaContext()
	if migrationRequested() {
		err = a.migrate(schemaCtx)
		schemaCancel()
		if err != nil {
			log.Fatal("No se pudieron preparar las tablas: ", err)
		}
		fmt.Println("Tablas de sesiones, recuperación y notificaciones preparadas.")
		return
	}
	if err = a.checkSchema(schemaCtx); err != nil {
		schemaCancel()
		log.Fatal("No se pudo comprobar el esquema: ", err)
	}
	schemaCancel()
	if os.Getenv("DISABLE_FILE_CLEANUP") != "1" {
		go a.cleanupWorker(ctx)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	srv := &http.Server{Addr: "127.0.0.1:" + port, Handler: a.routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	fmt.Println("API Go disponible en http://localhost:" + port)
	if err = srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
