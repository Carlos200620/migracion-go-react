import { usePagedProjects } from "../hooks/usePagedProjects";
import { usePdfPreview } from "../hooks/usePdfPreview";
import { Pagination } from "../components/molecules/Pagination";
import { useNotifications } from "../hooks/useNotifications";
import { StudentProjectsTable } from "../components/organisms/StudentProjectsTable";
import { ProjectForm } from "../components/organisms/ProjectForm";

import { ErrorMessage } from "../components/molecules/ErrorMessage";

import { Link, useLocation, useNavigate } from "react-router-dom";
import { ProjectDetail } from "../components/organisms/ProjectDetail";

import { useEffect, useState } from "react";

import { WorkspaceTemplate } from "../components/templates/WorkspaceTemplate";
import { api } from "../services/api";

import { useAuth } from "../hooks/useAuth";
import { useLogout } from "../hooks/useLogout";

export function StudentPage() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { busy, error, logout } = useLogout();
  const notifications = useNotifications(user);
  return (
    <WorkspaceTemplate
      notifications={notifications}
      user={user}
      busy={busy}
      error={error}
      onLogout={logout}
    >
      <StudentContent key={pathname} />
    </WorkspaceTemplate>
  );
}

function StudentContent() {
  const { pathname, search } = useLocation(),
    navigate = useNavigate(),
    { user, setUser } = useAuth();
  const pieces = pathname.split("/").filter(Boolean),
    mode =
      pieces[1] === "nuevo"
        ? "new"
        : pieces[2] === "editar"
          ? "edit"
          : pieces[1]
            ? "detail"
            : "list",
    id = pieces[1];
  const [project, setProject] = useState(null),
    [categories, setCategories] = useState([]),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [categoryError, setCategoryError] = useState(""),
    [fileError, setFileError] = useState(""),
    [file, setFile] = useState(null),
    [values, setValues] = useState({
      title: "",
      summary: "",
      objectives: "",
      authors: user.fullName,
      year: new Date().getFullYear(),
      categoryId: "",
    });
  const list = usePagedProjects(
    "/student/projects",
    { status },
    mode === "list",
  );
  const projects = list.items;
  const preview = usePdfPreview(
    project?.documentName ? "/api/student/projects/" + id + "/document" : null,
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
  async function loadCategories() {
    setCategoryError("");
    try {
      setCategories(await api("/categories"));
    } catch (e) {
      setCategoryError(e.message);
    }
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (mode === "list") return;
      else {
        if (mode === "new" || mode === "edit") await loadCategories();
        if (mode !== "new") {
          const p = await api("/student/projects/" + id);
          setProject(p);
          setValues({
            title: p.title,
            summary: p.summary,
            objectives: p.objectives,
            authors: p.authors,
            year: p.year,
            categoryId: String(p.categoryId),
          });
        }
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
  function choose(f) {
    setFile(null);
    setFileError("");
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) || !f.size || f.size > 10485760) {
      setFileError("Selecciona un PDF de hasta 10 MB.");
      return;
    }
    setFile(f);
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (fileError || (mode === "new" && !file)) {
      setFileError("Adjunta un PDF válido de hasta 10 MB.");
      return;
    }
    if (!categories.some((c) => String(c.id) === String(values.categoryId))) {
      setError("Selecciona una categoría activa.");
      return;
    }
    if (Object.values(values).some((v) => !String(v).trim())) {
      setError("Completa los campos obligatorios.");
      return;
    }
    const data = new FormData();
    for (const [key, value] of Object.entries(values))
      data.append(key, String(value));
    if (file) data.append("document", file);
    setBusy(true);
    try {
      await api("/student/projects" + (mode === "edit" ? "/" + id : ""), {
        method: mode === "edit" ? "PUT" : "POST",
        body: data,
      });
      navigate("/mis-proyectos?enviado=1");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const filtered = projects;
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <>
      {mode === "list" ? (
        <>
          <p className="eyebrow">ÁREA ESTUDIANTIL</p>
          <div className="page-heading">
            <div>
              <h1>Mis proyectos</h1>
              <p>Consulta el estado de tus envíos y gestiona tus proyectos.</p>
            </div>
            <Link className="primary" to="/mis-proyectos/nuevo">
              ＋ Registrar proyecto
            </Link>
          </div>
          {new URLSearchParams(search).has("enviado") && (
            <p className="success" role="status">
              Tu proyecto fue enviado a revisión correctamente.
            </p>
          )}
        </>
      ) : (
        <>
          <Link className="back" to="/mis-proyectos">
            ← Volver a mis proyectos
          </Link>
          <p className="eyebrow">ÁREA ESTUDIANTIL</p>
          <h1>
            {mode === "new"
              ? "Registrar proyecto"
              : mode === "edit"
                ? "Corregir proyecto"
                : "Detalle del proyecto"}
          </h1>
        </>
      )}
      <ErrorMessage
        error={error || list.error}
        retry={mode === "list" ? list.reload : load}
      />
      {(mode === "list" ? list.loading : loading) ? (
        <p role="status">Cargando tus proyectos…</p>
      ) : mode === "list" ? (
        <>
          {" "}
          <StudentProjectsTable
            total={list.total}
            filtered={filtered}
            projects={projects}
            status={status}
            setStatus={setStatus}
          />
          <Pagination {...list} onPage={list.setPage} />
        </>
      ) : mode === "detail" ? (
        project && (
          <section className="detail-card">
            <ProjectDetail p={project} preview={preview} />
          </section>
        )
      ) : mode === "new" || project?.status === "observed" ? (
        <>
          <p className="subtitle">
            Completa los datos y adjunta tu documento para enviarlo a revisión.
          </p>
          {mode === "edit" && (
            <section className="observation">
              <h3>Observaciones del administrador</h3>
              <p className="multiline">{project.observations}</p>
            </section>
          )}
          <ProjectForm
            submit={submit}
            values={values}
            set={set}
            categories={categories}
            categoryError={categoryError}
            loadCategories={loadCategories}
            mode={mode}
            project={project}
            file={file}
            fileError={fileError}
            choose={choose}
            setFile={setFile}
            setFileError={setFileError}
            busy={busy}
          />
        </>
      ) : (
        project && (
          <p className="info">Solo puedes modificar proyectos observados.</p>
        )
      )}
    </>
  );
}
