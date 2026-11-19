import { Brand } from "../molecules/Brand";
import { Link, NavLink } from "react-router-dom";

export function PublicHeader({ user }) {
  return (
    <header className="site-header">
      <Brand />
      <nav aria-label="Navegación principal">
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? "nav-active" : "")}
        >
          Inicio
        </NavLink>
        <NavLink
          to="/catalogo"
          className={({ isActive }) => (isActive ? "nav-active" : "")}
        >
          Catálogo
        </NavLink>
        <Link
          className="nav-access"
          to={
            user
              ? user.role === "admin"
                ? "/administracion"
                : "/mis-proyectos"
              : "/iniciar-sesion"
          }
        >
          {user ? "Mi cuenta" : "Iniciar sesión"}
        </Link>
      </nav>
    </header>
  );
}
