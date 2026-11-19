package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"log"
	"math/big"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

var codePattern = regexp.MustCompile(`^\d{8}$`)

func newRecoveryCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(100000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%08d", n.Int64()), nil
}
func (a *app) codeHash(userID int, code string) string {
	h := hmac.New(sha256.New, []byte(a.recoverySecret))
	_, _ = h.Write([]byte(strconv.Itoa(userID) + ":" + code))
	return hex.EncodeToString(h.Sum(nil))
}
func (a *app) requestResetCode(w http.ResponseWriter, r *http.Request) error {
	if err := a.rateLimit(r, "recovery-code", 5); err != nil {
		return err
	}
	var input struct {
		Email string `json:"email"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if len(input.Email) > 254 || !regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`).MatchString(input.Email) {
		return problem(400, "Introduce un correo electrónico válido.")
	}
	if a.mailer == nil || len(a.recoverySecret) < 32 {
		return problem(503, "La recuperación por correo todavía no está configurada. Contacta al administrador.")
	}
	start := time.Now()
	defer func() {
		remaining := 300*time.Millisecond - time.Since(start)
		if remaining > 0 {
			timer := time.NewTimer(remaining)
			defer timer.Stop()
			select {
			case <-timer.C:
			case <-r.Context().Done():
			}
		}
	}()
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var id int
	var email string
	err = tx.QueryRow(r.Context(), "SELECT id,email FROM users WHERE lower(email)=$1 FOR UPDATE", input.Email).Scan(&id, &email)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	send := false
	code, hash := "", ""
	if err == nil {
		var recentlySent bool
		err = tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM password_resets WHERE user_id=$1 AND method='code' AND created_at>now()-interval '60 seconds')", id).Scan(&recentlySent)
		if err != nil {
			return err
		}
		if !recentlySent {
			code, err = newRecoveryCode()
			if err != nil {
				return err
			}
			hash = a.codeHash(id, code)
			_, err = tx.Exec(r.Context(), "INSERT INTO password_resets(token_hash,user_id,expires_at,method,attempts) VALUES($1,$2,$3,'code',0) ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,used_at=NULL,created_at=now(),method='code',attempts=0", hash, id, time.Now().Add(10*time.Minute))
			if err != nil {
				return err
			}
			send = true
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	if send {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			if err := a.mailer.SendReset(ctx, email, code); err != nil {
				_, _ = a.db.Exec(ctx, "DELETE FROM password_resets WHERE token_hash=$1 AND method='code'", hash)
				log.Print("No se pudo entregar el código. Revisa la configuración SMTP.")
			}
		}()
	}
	jsonResponse(w, 200, map[string]any{"message": "Si el correo está registrado, recibirás un código de 8 dígitos. Revisa también correo no deseado.", "expiresIn": 600, "retryAfter": 60})
	return nil
}
func (a *app) resetWithCode(w http.ResponseWriter, r *http.Request) error {
	if err := a.rateLimit(r, "verify-code", 10); err != nil {
		return err
	}
	var input struct {
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if len(a.recoverySecret) < 32 {
		return problem(503, "La recuperación por correo todavía no está configurada.")
	}
	if len(input.Email) > 254 || !codePattern.MatchString(input.Code) || utf8.RuneCountInString(input.Password) < 8 || utf8.RuneCountInString(input.Password) > 128 {
		return problem(400, "Revisa el correo, el código de 8 dígitos y la contraseña (entre 8 y 128 caracteres).")
	}
	invalid := func() error {
		return problem(400, "El código no es válido, ha caducado o agotó sus intentos. Solicita otro si es necesario.")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var id int
	err = tx.QueryRow(r.Context(), "SELECT id FROM users WHERE lower(email)=$1 FOR UPDATE", input.Email).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return invalid()
	}
	if err != nil {
		return err
	}
	var hash string
	var attempts int
	var valid bool
	err = tx.QueryRow(r.Context(), "SELECT token_hash,attempts,(expires_at>now() AND used_at IS NULL) FROM password_resets WHERE user_id=$1 AND method='code' FOR UPDATE", id).Scan(&hash, &attempts, &valid)
	if errors.Is(err, pgx.ErrNoRows) {
		return invalid()
	}
	if err != nil {
		return err
	}
	if !valid || attempts >= 5 {
		return invalid()
	}
	if subtle.ConstantTimeCompare([]byte(hash), []byte(a.codeHash(id, input.Code))) != 1 {
		_, err = tx.Exec(r.Context(), "UPDATE password_resets SET attempts=attempts+1,used_at=CASE WHEN attempts>=4 THEN now() ELSE used_at END WHERE user_id=$1", id)
		if err != nil {
			return err
		}
		if err = tx.Commit(r.Context()); err != nil {
			return err
		}
		return invalid()
	}
	password, err := hashPassword(input.Password)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "UPDATE users SET password_hash=$1 WHERE id=$2", password, id); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "UPDATE password_resets SET used_at=now() WHERE user_id=$1", id); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "DELETE FROM user_sessions WHERE user_id=$1", id); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	a.setCookie(w, "", -1)
	jsonResponse(w, 200, map[string]string{"message": "Contraseña actualizada. Inicia sesión nuevamente con tu nueva contraseña."})
	return nil
}
