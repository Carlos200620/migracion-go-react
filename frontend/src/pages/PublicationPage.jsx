import { PdfPreview } from "../components/organisms/PdfPreview";
import { usePdfPreview } from "../hooks/usePdfPreview";
import { ErrorMessage } from "../components/molecules/ErrorMessage";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../services/api";

export function PublicationPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const preview = usePdfPreview(
    project?.hasDocument ? "/api/projects/" + id + "/document" : null,
  );
  async function load() {
    setLoading(true);
    setError("");
    try {
      setProject(await api("/projects/" + id));
    } catch (e) {
      setError(
        e.status === 404
          ? "El proyecto no existe o todavía no está publicado."
          : e.message,
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  return (
    <main className="publication">
      <Link to="/catalogo">← Volver al catálogo</Link>
      {loading ? (
        <p role="status">Cargando proyecto…</p>
      ) : error ? (
        <ErrorMessage error={error} retry={load} />
      ) : (
        project && (
          <>
            <p className="eyebrow">
              {project.category} · {project.year}
            </p>
            <h1>{project.title}</h1>
            <p>Autores: {project.authors}</p>
            <section>
              <h2>Resumen</h2>
              <p>{project.summary}</p>
              <h2>Objetivos</h2>
              <p>{project.objectives}</p>
              {project.hasDocument ? (
                <PdfPreview
                  url={"/api/projects/" + id + "/document"}
                  title={project.title}
                  {...preview}
                />
              ) : (
                <p>No hay documento disponible.</p>
              )}
            </section>
          </>
        )
      )}
    </main>
  );
}
