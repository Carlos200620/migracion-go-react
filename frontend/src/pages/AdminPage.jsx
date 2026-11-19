import { usePagedProjects } from "../hooks/usePagedProjects";
import { usePdfPreview } from "../hooks/usePdfPreview";
import { Pagination } from "../components/molecules/Pagination";
import { useNotifications } from "../hooks/useNotifications";
import { AdminActionDialog } from "../components/organisms/AdminActionDialog";
import { CategoryTable } from "../components/organisms/CategoryTable";
import { AdminProjectFilters } from "../components/organisms/AdminProjectFilters";
import { Button } from "../components/atoms/Button";
import { ErrorMessage } from "../components/molecules/ErrorMessage";

import { Link, useLocation, useNavigate } from "react-router-dom";

import { ProjectDetail } from "../components/organisms/ProjectDetail";
import { ProjectStatus } from "../components/molecules/ProjectStatus";
import { useEffect, useState } from "react";

import { Textarea } from "../components/atoms/Textarea";
import { WorkspaceTemplate } from "../components/templates/WorkspaceTemplate";
import { actionLabels, date, filterProjects } from "../utils/projects";
import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useLogout } from "../hooks/useLogout";

export function AdminPage() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { busy, error, logout } = useLogout();
  const notifications = useNotifications(user);
  return (
    <WorkspaceTemplate
      notifications={notifications}
      admin
      user={user}
      busy={busy}
      error={error}
      onLogout={logout}
    >
      <AdminContent key={pathname} />
    </WorkspaceTemplate>
  );
}

function AdminContent() {
  const { pathname } = useLocation(),
    navigate = useNavigate(),
    { setUser } = useAuth();
  const pieces = pathname.split("/").filter(Boolean),
    mode =
      pieces[1] === "categorias"
        ? "categories"
        : pieces[2]
          ? "review"
          : pieces[1] === "proyectos"
            ? "list"
            : "summary",
    id = pieces[2];
  const [projects, setProjects] = useState([]),
    [project, setProject] = useState(null),
    [categories, setCategories] = useState([]),
    [counts, setCounts] = useState({ pending: 0, observed: 0, approved: 0 }),
    [history, setHistory] = useState([]),
    [historyError, setHistoryError] = useState(""),
    [filters, setFilters] = useState({
      query: "",
      status: "",
      category: "",
      from: "",
      to: "",
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [observations, setObservations] = useState(""),
    [modal, setModal] = useState(null),
    [modalError, setModalError] = useState("");
  const list = usePagedProjects(
    "/admin/projects",
    {
      q: filters.query,
      status: filters.status,
      category: filters.category,
      from: filters.from,
      to: filters.to,
    },
    mode === "list",
  );
  const [categoryNames, setCategoryNames] = useState([]);
  const preview = usePdfPreview(
    project?.documentName ? "/api/admin/projects/" + id + "/document" : null,
  );
  useEffect(() => {
    if (list.errorStatus === 401) {
      setUser(null);
      navigate("/iniciar-sesion");
    }
  }, [list.errorStatus]);
  function fail(e) {
    if (e.status === 401) {
      setUser(null);
      navigate("/iniciar-sesion");
    } else setError(e.message);
  }
  async function loadHistory() {
    setHistoryError("");
    try {
      setHistory(await api("/admin/projects/" + id + "/history"));
    } catch (e) {
      setHistoryError(e.message);
    }
  }
  async function load() {
    setError("");
    setLoading(true);
    try {
      if (mode === "summary") {
        const [c, p] = await Promise.all([
          api("/admin/summary"),
          api("/admin/projects?status=pending&pageSize=8"),
        ]);
        setCounts(c);
        setProjects(p.items);
      } else if (mode === "list") {
        setCategoryNames((await api("/admin/project-filters")).categories);
        list.reload();
      } else if (mode === "categories")
        setCategories(await api("/admin/categories"));
      else {
        const p = await api("/admin/projects/" + id);
        setProject(p);
        setObservations(p.observations);
        await loadHistory();
      }
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function open(data) {
    setModalError("");
    setError("");
    setSuccess("");
    setModal(data);
  }
  async function toggle(c) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/categories/" + c.id + "/status", {
        method: "PATCH",
        body: { active: !c.active },
      });
      setSuccess(
        c.active
          ? "Categoría desactivada. Los proyectos asociados se conservan."
          : "Categoría activada.",
      );
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveModal(e) {
    e.preventDefault();
    if (busy) return;
    setModalError("");
    const f = new FormData(e.currentTarget);
    let url,
      method = "POST",
      body;
    if (modal.type === "category") {
      const name = f.get("name").trim();
      if (!name) {
        setModalError("Escribe el nombre de la categoría.");
        return;
      }
      url =
        "/admin/categories" +
        (modal.category?.id ? "/" + modal.category.id : "");
      method = modal.category?.id ? "PUT" : "POST";
      body = {
        name,
        description: f.get("description"),
        active: f.has("active"),
      };
    } else if (modal.type === "review") {
      url = "/admin/projects/" + id + "/review";
      body = {
        decision: modal.decision,
        observations,
        version: project.version,
      };
    } else {
      if (!f.get("reason").trim()) {
        setModalError("Escribe el motivo de la acción.");
        return;
      }
      if (
        modal.action === "delete" &&
        f.get("confirmation") !== modal.project.title
      ) {
        setModalError(
          "Escribe exactamente el título para confirmar la eliminación.",
        );
        return;
      }
      url = "/admin/projects/" + modal.project.id + "/lifecycle";
      body = {
        action: modal.action,
        reason: f.get("reason").trim(),
        version: modal.project.version,
        confirmation: f.get("confirmation") || "",
      };
    }
    setBusy(true);
    try {
      const result = await api(url, { method, body });
      setModal(null);
      setSuccess(result.message || "Categoría guardada correctamente.");
      if (
        modal.type === "action" &&
        modal.action === "delete" &&
        mode === "review"
      )
        navigate("/administracion/proyectos");
      else await load();
    } catch (e) {
      if (e.status === 401) {
        setModal(null);
        fail(e);
      } else setModalError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function actions(p) {
    return (
      <>
        {p.status === "approved" && (
          <Button
            type="submit"
            className="text-action"
            disabled={busy}
            onClick={() =>
              open({ type: "action", project: p, action: "withdraw" })
            }
          >
            Retirar
          </Button>
        )}
        {p.status === "withdrawn" && (
          <Button
            type="submit"
            className="text-action"
            disabled={busy}
            onClick={() =>
              open({ type: "action", project: p, action: "restore" })
            }
          >
            Restaurar
          </Button>
        )}
        <Button
          type="submit"
          className="text-action danger-link"
          disabled={busy}
          onClick={() => open({ type: "action", project: p, action: "delete" })}
        >
          Eliminar
        </Button>
      </>
    );
  }
  const filtered = list.items;
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  return (
    <>
      <p className="eyebrow">
        {mode === "categories" ? "CONFIGURACIÓN" : "ÁREA ADMINISTRATIVA"}
      </p>
      {mode !== "categories" && (
        <h1>
          {mode === "summary"
            ? "Resumen"
            : mode === "list"
              ? "Revisar proyectos"
              : "Revisar proyecto"}
        </h1>
      )}
      {mode === "summary" && (
        <p className="subtitle">Estado general del repositorio académico.</p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      <ErrorMessage error={error || list.error} retry={load} />
      {loading || (mode === "list" && list.loading) ? (
        <p role="status">Cargando información…</p>
      ) : (
        <>
          {mode === "summary" && (
            <>
              <div className="stats">
                {[
                  ["pending", "◷", "Pendientes de revisión"],
                  ["observed", "▤", "Observados"],
                  ["approved", "✓", "Aprobados"],
                ].map(([key, icon, label]) => (
                  <Link key={key} to="/administracion/proyectos">
                    <span className="stat-icon">{icon}</span>
                    <div>
                      <strong>{counts[key]}</strong>
                      <span>{label}</span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="section-title">
                <h2>Proyectos por revisar</h2>
                <Link to="/administracion/proyectos">Ver todos →</Link>
              </div>
              <section className="table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>PROYECTO</th>
                        <th>ESTUDIANTE</th>
                        <th>CATEGORÍA</th>
                        <th>ENVIADO</th>
                        <th>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects
                        .filter((p) => p.status === "pending")
                        .slice(0, 8)
                        .map((p) => (
                          <tr key={p.id}>
                            <td data-label="PROYECTO">
                              <strong>{p.title}</strong>
                            </td>
                            <td data-label="ESTUDIANTE">{p.studentName}</td>
                            <td data-label="CATEGORÍA">{p.category}</td>
                            <td data-label="ENVIADO">{date(p.createdAt)}</td>
                            <td data-label="ACCIONES">
                              <Link
                                className="secondary"
                                to={"/administracion/proyectos/" + p.id}
                              >
                                Revisar
                              </Link>
                            </td>
                          </tr>
                        ))}
                      {!projects.some((p) => p.status === "pending") && (
                        <tr>
                          <td colSpan="5" className="empty">
                            No hay proyectos pendientes de revisión.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {mode === "list" && (
            <>
              <p className="subtitle">
                Consulta los envíos y revisa los proyectos pendientes.
              </p>
              <AdminProjectFilters
                filters={filters}
                setFilter={setFilter}
                categoryNames={categoryNames}
              />
              <>
                {" "}
                <section className="table-card">
                  <div className="table-toolbar">
                    <strong>
                      {list.total} {list.total === 1 ? "proyecto" : "proyectos"}
                    </strong>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>PROYECTO</th>
                          <th>ESTUDIANTE</th>
                          <th>ESTADO</th>
                          <th>ENVIADO</th>
                          <th>ACCIONES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p) => (
                          <tr key={p.id}>
                            <td data-label="PROYECTO">
                              <strong>{p.title}</strong>
                              <small>{p.category}</small>
                            </td>
                            <td data-label="ESTUDIANTE">{p.studentName}</td>
                            <td data-label="ESTADO">
                              <ProjectStatus status={p.status} />
                            </td>
                            <td data-label="ENVIADO">{date(p.createdAt)}</td>
                            <td data-label="ACCIONES">
                              <div className="actions project-actions">
                                <Link to={"/administracion/proyectos/" + p.id}>
                                  {p.status === "pending"
                                    ? "Revisar"
                                    : "Ver detalle"}
                                </Link>
                                {actions(p)}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!filtered.length && (
                          <tr>
                            <td colSpan="5" className="empty">
                              No hay proyectos que coincidan con los filtros.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <Pagination {...list} onPage={list.setPage} />
              </>
            </>
          )}
          {mode === "review" && (
            <>
              <Link className="back" to="/administracion/proyectos">
                ← Volver a proyectos
              </Link>
              {project && (
                <section className="detail-card">
                  <ProjectDetail p={project} preview={preview} admin />
                  {project.status === "pending" ? (
                    <>
                      <label className="review-label" htmlFor="observations">
                        Observaciones
                        <small>
                          Obligatorias para devolver el proyecto. Máximo 5000
                          caracteres.
                        </small>
                      </label>
                      <Textarea
                        id="observations"
                        maxLength={5000}
                        rows="5"
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                      />
                      <div className="form-actions">
                        <Button
                          type="submit"
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            if (!observations.trim()) {
                              setError(
                                "Escribe las observaciones antes de devolver el proyecto.",
                              );
                              return;
                            }
                            open({ type: "review", decision: "observed" });
                          }}
                        >
                          Devolver con observaciones
                        </Button>
                        <Button
                          type="submit"
                          className="primary"
                          disabled={busy || !project.documentName}
                          onClick={() =>
                            open({ type: "review", decision: "approved" })
                          }
                        >
                          Aprobar y publicar ✓
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="info">Este proyecto ya fue revisado.</p>
                  )}
                  <div className="form-actions">{actions(project)}</div>
                  <h3>Historial de acciones</h3>
                  <ErrorMessage error={historyError} retry={loadHistory} />
                  {history.map((event) => (
                    <div className="history-event" key={event.id}>
                      <strong>{actionLabels[event.action]}</strong>
                      <small>
                        {event.actorName} ·{" "}
                        {new Date(event.createdAt).toLocaleString("es-PE")}
                      </small>
                      <p className="multiline">{event.reason}</p>
                    </div>
                  ))}
                  {!historyError && !history.length && (
                    <p>
                      No hay retiros, restauraciones o eliminaciones registrados
                      para este proyecto.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          {mode === "categories" && (
            <>
              <div className="category-heading">
                <div>
                  <h1>Categorías</h1>
                  <p className="subtitle">
                    Organiza las áreas de conocimiento del repositorio.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="primary"
                  disabled={busy}
                  onClick={() => open({ type: "category" })}
                >
                  ＋ Nueva categoría
                </Button>
              </div>
              <CategoryTable
                categories={categories}
                busy={busy}
                onEdit={(c) => open({ type: "category", category: c })}
                onToggle={toggle}
              />
            </>
          )}
        </>
      )}
      {modal && (
        <AdminActionDialog
          modal={modal}
          busy={busy}
          onClose={() => setModal(null)}
          saveModal={saveModal}
          project={project}
          observations={observations}
          modalError={modalError}
        />
      )}
    </>
  );
}
