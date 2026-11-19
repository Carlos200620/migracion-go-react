import { AuthForm } from "../components/organisms/AuthForm";
import { AuthTemplate } from "../components/templates/AuthTemplate";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";

export function AuthPage({ register = false }) {
  const { setUser } = useAuth(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (register && values.password !== values.confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      if (register) {
        const r = await api("/auth/register", { method: "POST", body: values });
        setSuccess(r.message);
      } else {
        const r = await api("/auth/login", { method: "POST", body: values });
        setUser(r.user);
        navigate(
          r.user.role === "admin" ? "/administracion" : "/mis-proyectos",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthTemplate>
      <p className="eyebrow">
        {register ? "COMPARTE TU CONOCIMIENTO" : "BIENVENIDO DE NUEVO"}
      </p>
      <h1>{register ? "Crear cuenta" : "Iniciar sesión"}</h1>
      <p className="intro">
        {register
          ? "Únete a nuestra comunidad académica."
          : "Accede a tu espacio académico."}
      </p>
      {success ? (
        <>
          <p className="success" role="status">
            {success}
          </p>
          <Link className="primary" to="/iniciar-sesion">
            Iniciar sesión →
          </Link>
        </>
      ) : (
        <>
          <AuthForm
            register={register}
            busy={busy}
            error={error}
            onSubmit={submit}
          />
          <p className="switch">
            {register ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
            <Link to={register ? "/iniciar-sesion" : "/crear-cuenta"}>
              {register ? "Iniciar sesión" : "Crear cuenta"}
            </Link>
          </p>
        </>
      )}
    </AuthTemplate>
  );
}
