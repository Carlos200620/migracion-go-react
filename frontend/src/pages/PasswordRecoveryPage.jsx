import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { AuthTemplate } from "../components/templates/AuthTemplate";
import { FormField } from "../components/molecules/FormField";
import { ErrorMessage } from "../components/molecules/ErrorMessage";
import { Button } from "../components/atoms/Button";
export function PasswordRecoveryPage({ reset = false }) {
  const location = useLocation(), navigate = useNavigate(), { setUser } = useAuth();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") || "");
  const [enabled, setEnabled] = useState(reset), [checking, setChecking] = useState(!reset);
  const [email, setEmail] = useState(""), [sent, setSent] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [success, setSuccess] = useState(""), [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (reset) { if (location.hash) navigate(location.pathname, { replace: true }); return; }
    let live = true;
    api("/auth/recovery-status").then(r => { if (live) setEnabled(r.enabled); })
      .catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [reset]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function sendCode(address) {
    setBusy(true); setError("");
    try {
      const r = await api("/auth/request-code", { method: "POST", body: { email: address } });
      setEmail(address); setSent(true); setNotice(r.message); setCooldown(r.retryAfter || 60);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submit(e) {
    e.preventDefault(); setError("");
    const f = new FormData(e.currentTarget);
    if (!reset && !sent) { await sendCode(String(f.get("email")).trim()); return; }
    if (f.get("password") !== f.get("confirmation")) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      const r = await api(reset ? "/auth/reset-password" : "/auth/reset-with-code", {
        method: "POST", body: reset ? { token, password: f.get("password") } : { email, code: f.get("code"), password: f.get("password") }
      });
      setSuccess(r.message); setUser(null);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <AuthTemplate>
    <p className="eyebrow">RECUPERA TU ACCESO</p>
    <h1>{reset || sent ? "Nueva contraseña" : "¿Olvidaste tu contraseña?"}</h1>
    <p className="intro">{reset ? "Elige una contraseña de entre 8 y 128 caracteres." : sent ? `Introduce el código enviado a ${email}. Es válido durante 10 minutos.` : "Te enviaremos un código de 8 dígitos para restablecer tu contraseña."}</p>
    <ErrorMessage error={error} />
    {checking ? <p role="status">Comprobando disponibilidad…</p> : success ? <p className="success" role="status">{success}</p> : reset && !token ?
      <p className="error" role="alert">Falta el enlace de recuperación. <Link to="/recuperar-contrasena">Solicita uno nuevo</Link>.</p> : !reset && !enabled ?
      <p className="info">La recuperación por correo todavía no está configurada. Contacta al administrador para habilitarla.</p> : <>
      {notice && <p className="info" role="status">{notice}</p>}
      <form onSubmit={submit}>
        {reset || sent ? <>
          {!reset && <FormField id="recovery-code" name="code" label="Código de verificación" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} required />}
          <FormField id="new-password" name="password" label="Nueva contraseña" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
          <FormField id="confirmation" name="confirmation" label="Confirmar contraseña" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
        </> : <FormField id="recovery-email" name="email" label="Correo electrónico" type="email" autoComplete="email" required maxLength={254} />}
        <Button type="submit" className="primary" disabled={busy}>{busy ? "Procesando…" : reset || sent ? "Guardar contraseña" : "Enviar código de verificación"}</Button>
      </form>
      {sent && !reset && <p className="switch">
        <Button type="button" disabled={busy || cooldown > 0} onClick={() => sendCode(email)}>{cooldown ? `Reenviar código en ${cooldown} s` : "Reenviar código"}</Button>{" "}
        <Button type="button" disabled={busy} onClick={() => { setSent(false); setNotice(""); setError(""); }}>Cambiar correo</Button>
      </p>}
    </>}
    <p className="switch"><Link to="/iniciar-sesion">Volver a iniciar sesión</Link></p>
  </AuthTemplate>;
}
