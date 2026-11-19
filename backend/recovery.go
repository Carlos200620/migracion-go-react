package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

type resetMailer interface {
	SendReset(context.Context, string, string) error
}
type smtpMailer struct{ host, port, username, password, from, mode string }

func smtpMailerFromEnv() resetMailer {
	host, from := strings.TrimSpace(os.Getenv("SMTP_HOST")), strings.TrimSpace(os.Getenv("SMTP_FROM"))
	if host == "" || from == "" || (strings.EqualFold(host, "smtp.gmail.com") && (os.Getenv("SMTP_USERNAME") == "" || os.Getenv("SMTP_PASSWORD") == "")) {
		return nil
	}
	if _, err := mail.ParseAddress(from); err != nil {
		return nil
	}
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	mode := os.Getenv("SMTP_TLS")
	if mode == "" {
		mode = "starttls"
	}
	if mode != "starttls" && mode != "tls" {
		return nil
	}
	return &smtpMailer{host, port, os.Getenv("SMTP_USERNAME"), os.Getenv("SMTP_PASSWORD"), from, mode}
}
func (m *smtpMailer) SendReset(ctx context.Context, to, link string) error {
	recipient, err := mail.ParseAddress(to)
	if err != nil {
		return err
	}
	sender, err := mail.ParseAddress(m.from)
	if err != nil {
		return err
	}
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	var conn net.Conn
	tlsConfig := &tls.Config{ServerName: m.host, MinVersion: tls.VersionTLS12}
	if m.mode == "tls" {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: tlsConfig}).DialContext(ctx, "tcp", net.JoinHostPort(m.host, m.port))
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", net.JoinHostPort(m.host, m.port))
	}
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
	client, err := smtp.NewClient(conn, m.host)
	if err != nil {
		return err
	}
	defer client.Close()
	if m.mode == "starttls" {
		if err = client.StartTLS(tlsConfig); err != nil {
			return err
		}
	}
	if m.username != "" {
		if err = client.Auth(smtp.PlainAuth("", m.username, m.password, m.host)); err != nil {
			return err
		}
	}
	if err = client.Mail(sender.Address); err != nil {
		return err
	}
	if err = client.Rcpt(recipient.Address); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	message := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: Recuperar acceso al repositorio\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nSolicitaste cambiar tu contraseña del repositorio.\r\nAbre este enlace, válido por 30 minutos y para un solo uso:\r\n%s\r\n\r\nSi no solicitaste el cambio, ignora este mensaje.\r\n", sender.String(), recipient.String(), link)
	if codePattern.MatchString(link) {
		message = fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: Codigo de verificacion del repositorio\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nTu código de verificación es: %s\r\n\r\nEs válido durante 10 minutos, para un solo uso y hasta 5 intentos. No lo compartas.\r\nSi no solicitaste recuperar tu contraseña, ignora este mensaje.\r\n", sender.String(), recipient.String(), link)
	}
	if _, err = io.WriteString(writer, message); err != nil {
		return err
	}
	if err = writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}
func (a *app) recoveryStatus(w http.ResponseWriter, r *http.Request) error {
	jsonResponse(w, 200, map[string]any{"enabled": a.mailer != nil && len(a.recoverySecret) >= 32, "method": "code", "digits": 8})
	return nil
}

var resetTokenPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (a *app) forgotPassword(w http.ResponseWriter, r *http.Request) error {
	if err := a.rateLimit(r, "recovery", 5); err != nil {
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
	if a.mailer == nil {
		return problem(503, "La recuperación por correo todavía no está configurada. Contacta al administrador.")
	}
	// Generic response and minimum time avoid exposing whether an email is registered.
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
	var id int
	var email string
	err := a.db.QueryRow(r.Context(), "SELECT id,email FROM users WHERE lower(email)=$1", input.Email).Scan(&id, &email)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil {
		token := randomHex(32)
		hash := tokenHash(token)
		_, err = a.db.Exec(r.Context(), "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,used_at=NULL,created_at=now(),method='link',attempts=0", hash, id, time.Now().Add(30*time.Minute))
		if err != nil {
			return err
		}
		link := strings.TrimRight(a.origin, "/") + "/restablecer-contrasena#token=" + url.QueryEscape(token)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			if err := a.mailer.SendReset(ctx, email, link); err != nil {
				_, _ = a.db.Exec(ctx, "DELETE FROM password_resets WHERE token_hash=$1", hash)
				log.Print("No se pudo entregar un correo de recuperación. Revisa la configuración SMTP.")
			}
		}()
	}
	jsonResponse(w, 200, map[string]string{"message": "Si el correo está registrado, recibirás un enlace para cambiar tu contraseña. Revisa también la carpeta de correo no deseado."})
	return nil
}
func (a *app) resetPassword(w http.ResponseWriter, r *http.Request) error {
	if err := a.rateLimit(r, "reset", 10); err != nil {
		return err
	}
	var input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if !resetTokenPattern.MatchString(input.Token) || utf8.RuneCountInString(input.Password) < 8 || utf8.RuneCountInString(input.Password) > 128 {
		return problem(400, "Revisa el enlace y la contraseña (entre 8 y 128 caracteres).")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var id int
	err = tx.QueryRow(r.Context(), "SELECT user_id FROM password_resets WHERE token_hash=$1 AND method='link' AND used_at IS NULL AND expires_at>now() FOR UPDATE", tokenHash(input.Token)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return problem(400, "El enlace no es válido o ha caducado. Solicita uno nuevo.")
	}
	if err != nil {
		return err
	}
	hash, err := hashPassword(input.Password)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "UPDATE users SET password_hash=$1 WHERE id=$2", hash, id); err != nil {
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
