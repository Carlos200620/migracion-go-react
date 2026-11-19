import { Link } from "react-router-dom";
import { Logo } from "../atoms/Logo";
export function AuthTemplate({ children }) {
  return (
    <div className="auth-scope">
      <section className="auth-page">
        <Link className="auth-brand" to="/">
          <Logo />
          Repositorio de proyectos
        </Link>
        <main className="auth-card">
          <Link to="/" className="back">
            ← Volver al inicio
          </Link>
          {children}
        </main>
      </section>
    </div>
  );
}
