import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLogout } from "../hooks/useLogout";
import { usePagedProjects } from "../hooks/usePagedProjects";
import { api } from "../services/api";
import { WorkspaceTemplate } from "../components/templates/WorkspaceTemplate";
import { Pagination } from "../components/molecules/Pagination";
import { ErrorMessage } from "../components/molecules/ErrorMessage";
import { Button } from "../components/atoms/Button";
export function NotificationsPage() {
  const { user } = useAuth(),
    logout = useLogout(),
    data = usePagedProjects("/notifications"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function mark(id) {
    setBusy(true);
    setError("");
    try {
      await api(
        id ? "/notifications/" + id + "/read" : "/notifications/read-all",
        { method: "PATCH", body: {} },
      );
      data.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceTemplate
      user={user}
      admin={user.role === "admin"}
      busy={logout.busy}
      error={logout.error}
      onLogout={logout.logout}
    >
      <p className="eyebrow">TU ACTIVIDAD</p>
      <div className="page-heading">
        <div>
          <h1>Notificaciones</h1>
          <p>Conoce los cambios de estado de tus proyectos.</p>
        </div>
        <Button
          className="secondary"
          disabled={busy || !data.unread}
          onClick={() => mark()}
        >
          Marcar todas como leídas
        </Button>
      </div>
      <ErrorMessage error={error || data.error} retry={data.reload} />
      {data.loading ? (
        <p role="status">Cargando notificaciones…</p>
      ) : (
        <>
          <ul className="notification-list">
            {data.items.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "unread"}>
                <h2>{n.projectTitle}</h2>
                <p>{n.message}</p>
                <small>{new Date(n.createdAt).toLocaleString("es-PE")}</small>
                <div className="actions">
                  <Link
                    to={
                      n.kind === "delete"
                        ? "/mis-proyectos"
                        : "/mis-proyectos/" + n.projectId
                    }
                  >
                    Ver {n.kind === "delete" ? "mis proyectos" : "proyecto"}
                  </Link>
                  {!n.readAt && (
                    <Button
                      className="text-action"
                      disabled={busy}
                      onClick={() => mark(n.id)}
                    >
                      Marcar como leída
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!data.items.length && (
            <p className="info">
              No tienes notificaciones todavía. Aparecerán cuando cambie el
              estado de un proyecto.
            </p>
          )}
          <Pagination {...data} onPage={data.setPage} />
        </>
      )}
    </WorkspaceTemplate>
  );
}
