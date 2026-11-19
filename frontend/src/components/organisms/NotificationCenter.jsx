import { Link } from "react-router-dom";
import { Button } from "../atoms/Button";
export function NotificationCenter({
  items = [],
  unread = 0,
  error,
  busy,
  read,
  readAll,
  refresh,
}) {
  return (
    <details className="notification-center">
      <summary aria-label={"Notificaciones: " + unread + " sin leer"}>
        <span aria-hidden="true">🔔</span> Notificaciones{" "}
        {unread > 0 && <span className="notification-count">{unread}</span>}
      </summary>
      <div className="notification-popover">
        <div className="notification-title">
          <strong>Notificaciones</strong>
          {unread > 0 && (
            <Button disabled={busy} onClick={readAll}>
              Marcar todas como leídas
            </Button>
          )}
        </div>
        {error ? (
          <p role="alert">
            {error} <Button onClick={refresh}>Reintentar</Button>
          </p>
        ) : items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id} className={item.readAt ? "" : "unread"}>
                <p>{item.message}</p>
                <small>
                  {new Date(item.createdAt).toLocaleString("es-PE")}
                </small>
                {!item.readAt && (
                  <Button disabled={busy} onClick={() => read(item.id)}>
                    Marcar como leída
                  </Button>
                )}
                <Link
                  to={
                    item.kind === "delete"
                      ? "/mis-proyectos"
                      : "/mis-proyectos/" + item.projectId
                  }
                >
                  Ver {item.kind === "delete" ? "mis proyectos" : "proyecto"} →
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No tienes notificaciones.</p>
        )}
        <Link className="notification-all" to="/notificaciones">
          Ver todas las notificaciones →
        </Link>
      </div>
    </details>
  );
}
