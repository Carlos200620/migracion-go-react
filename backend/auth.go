package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/scrypt"
)

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func hashPassword(password string) (string, error) {
	salt := randomHex(16)
	key, err := scrypt.Key([]byte(password), []byte(salt), 16384, 8, 1, 64)
	if err != nil {
		return "", err
	}
	return "scrypt$" + salt + "$" + hex.EncodeToString(key), nil
}
func verifyPassword(password, hash string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 3 || parts[0] != "scrypt" || len(parts[1]) != 32 || len(parts[2]) != 128 {
		return false
	}
	expected, err := hex.DecodeString(parts[2])
	if err != nil {
		return false
	}
	key, err := scrypt.Key([]byte(password), []byte(parts[1]), 16384, 8, 1, 64)
	return err == nil && subtle.ConstantTimeCompare(key, expected) == 1
}
func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func cookieToken(r *http.Request) string {
	cookie, err := r.Cookie("rp_session")
	if err != nil {
		return ""
	}
	return cookie.Value
}
func (a *app) rateLimit(r *http.Request, group string, limit int) error {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	key := group + ":" + ip
	now := time.Now()
	a.mu.Lock()
	defer a.mu.Unlock()
	for k, v := range a.rates {
		if now.After(v.Expires) {
			delete(a.rates, k)
		}
	}
	entry := a.rates[key]
	if entry.Expires.IsZero() {
		entry.Expires = now.Add(15 * time.Minute)
	}
	entry.Count++
	a.rates[key] = entry
	if entry.Count > limit {
		return problem(429, "Demasiados intentos. Inténtalo en 15 minutos.")
	}
	return nil
}
func (a *app) currentUser(r *http.Request) (user, error) {
	token := cookieToken(r)
	if len(token) != 64 {
		return user{}, problem(401, "Tu sesión terminó. Vuelve a iniciar sesión.")
	}
	var id int
	err := a.db.QueryRow(r.Context(), "SELECT user_id FROM user_sessions WHERE token_hash=$1 AND expires_at>now()", tokenHash(token)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return user{}, problem(401, "Tu sesión terminó. Vuelve a iniciar sesión.")
	}
	if err != nil {
		return user{}, err
	}
	return a.getUser(r, "id=$1", id)
}
func (a *app) getUser(r *http.Request, where string, value any) (user, error) {
	var u user
	err := a.db.QueryRow(r.Context(), "SELECT id,full_name,email,role,password_hash FROM users WHERE "+where, value).Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &u.Hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, problem(401, "Correo o contraseña incorrectos.")
	}
	return u, err
}
func (a *app) setCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: "rp_session", Value: token, Path: "/api", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteStrictMode, MaxAge: maxAge})
}
func (a *app) register(w http.ResponseWriter, r *http.Request) error {
	if err := a.rateLimit(r, "auth", 30); err != nil {
		return err
	}
	var input struct {
		FullName string `json:"fullName"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	input.FullName = strings.TrimSpace(input.FullName)
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if utf8.RuneCountInString(input.FullName) < 2 || utf8.RuneCountInString(input.FullName) > 150 || len(input.Email) > 254 || !regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`).MatchString(input.Email) || utf8.RuneCountInString(input.Password) < 8 || utf8.RuneCountInString(input.Password) > 128 {
		return problem(400, "Revisa el nombre, el correo y la contraseña (entre 8 y 128 caracteres).")
	}
	hash, err := hashPassword(input.Password)
	if err != nil {
		return err
	}
	var u user
	err = a.db.QueryRow(r.Context(), "INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,'student') RETURNING id,full_name,email,role", input.FullName, input.Email, hash).Scan(&u.ID, &u.FullName, &u.Email, &u.Role)
	if err != nil {
		return err
	}
	jsonResponse(w, 201, map[string]any{"user": u, "message": "Cuenta creada. Ya puedes iniciar sesión."})
	return nil
}
func (a *app) login(w http.ResponseWriter, r *http.Request) error {
	if err := a.rateLimit(r, "auth", 30); err != nil {
		return err
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if len(input.Email) > 254 || input.Password == "" || utf8.RuneCountInString(input.Password) > 128 {
		return problem(400, "Introduce tu correo y contraseña.")
	}
	u, err := a.getUser(r, "lower(email)=$1", strings.ToLower(strings.TrimSpace(input.Email)))
	hash := a.dummyHash
	if err == nil {
		hash = u.Hash
	}
	valid := verifyPassword(input.Password, hash)
	if err != nil {
		var ae *apiError
		if !errors.As(err, &ae) {
			return err
		}
	}
	if err != nil || !valid {
		return problem(401, "Correo o contraseña incorrectos.")
	}
	token := randomHex(32)
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), "DELETE FROM user_sessions WHERE token_hash=$1 OR expires_at<=now()", tokenHash(cookieToken(r))); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", tokenHash(token), u.ID, time.Now().Add(8*time.Hour)); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	a.setCookie(w, token, 8*3600)
	jsonResponse(w, 200, map[string]any{"user": u})
	return nil
}
func (a *app) logout(w http.ResponseWriter, r *http.Request) error {
	var input map[string]any
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if token := cookieToken(r); token != "" {
		if _, err := a.db.Exec(r.Context(), "DELETE FROM user_sessions WHERE token_hash=$1", tokenHash(token)); err != nil {
			return err
		}
	}
	a.setCookie(w, "", -1)
	jsonResponse(w, 200, map[string]string{"message": "Sesión cerrada."})
	return nil
}
