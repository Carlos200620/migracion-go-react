import { Button } from "../atoms/Button";
import { Link, NavLink } from "react-router-dom";
import { Logo } from "../atoms/Logo";

export function WorkspaceSidebar({
  admin = false,
  busy = false,
  onLogout,
  onNavigate,
}) {
  return (
    <aside
      id="workspace-navigation"
      onClick={(e) => {
        if (e.target.closest("a")) onNavigate?.();
      }}
    >
      <Button className="drawer-close" onClick={onNavigate}>
        Cerrar menú ✕
      </Button>
      <Link className="student-brand" to="/">
        <Logo />
        <span>
          Repositorio
          <small>{admin ? "Área administrativa" : "Área estudiantil"}</small>
        </span>
      </Link>
      <nav aria-label={admin ? "Área administrativa" : "Área estudiantil"}>
        {(admin
          ? [
              ["/administracion", "▤ Resumen"],
              ["/administracion/proyectos", "▤ Revisar proyectos"],
              ["/administracion/categorias", "▢ Categorías"],
            ]
          : [
              ["/mis-proyectos", "▤ Mis proyectos"],
              ["/mis-proyectos/nuevo", "＋ Nuevo proyecto"],
            ]
        ).map(([url, label]) => (
          <NavLink
            key={url}
            to={url}
            end
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Link className="public-link" to="/notificaciones">
        🔔 Notificaciones
      </Link>
      <Link className="public-link" to="/catalogo">
        ← Catálogo público
      </Link>
      <Button
        type="submit"
        className="logout"
        disabled={busy}
        onClick={onLogout}
      >
        Cerrar sesión
      </Button>
    </aside>
  );
}
