import { PdfPreview } from "./PdfPreview";
import { Link } from "react-router-dom";
import { ProjectStatus } from "../molecules/ProjectStatus";

import { date } from "../../utils/projects";

export function ProjectDetail({ p, admin = false, preview }) {
  return (
    <>
      <ProjectStatus status={p.status} />
      <h2>{p.title}</h2>
      <p className="meta">
        {p.category} · {p.year} ·{" "}
        {admin ? p.studentName : "Enviado el " + date(p.createdAt)}
      </p>
      <h3>Autores</h3>
      <p>{p.authors}</p>
      <h3>Resumen</h3>
      <p className="multiline">{p.summary}</p>
      <h3>Objetivos</h3>
      <p className="multiline">{p.objectives}</p>
      {p.status === "pending" && !admin && (
        <p className="info">
          Tu proyecto está pendiente de revisión. Se publicará cuando sea
          aprobado.
        </p>
      )}
      {p.status === "observed" && (
        <section className="observation">
          <h3>Observaciones del administrador</h3>
          <p className="multiline">{p.observations}</p>
          {!admin && (
            <Link className="primary" to={"/mis-proyectos/" + p.id + "/editar"}>
              Corregir y reenviar →
            </Link>
          )}
        </section>
      )}
      {p.status === "withdrawn" && (
        <section className="observation">
          <h3>Retirado del catálogo</h3>
          <p className="multiline">{p.withdrawalReason}</p>
          <p>El proyecto se conserva, pero no está disponible públicamente.</p>
        </section>
      )}
      {p.status === "approved" && (
        <>
          <p className="success">
            El proyecto está aprobado y disponible en el catálogo público.
          </p>
          <Link className="secondary" to={"/proyectos/" + p.id}>
            Ver publicación →
          </Link>
        </>
      )}
      <h3>Documento adjunto</h3>
      {p.documentName ? (
        <>
          <p>{p.documentName}</p>
          <PdfPreview
            url={
              "/api/" +
              (admin ? "admin" : "student") +
              "/projects/" +
              p.id +
              "/document"
            }
            title={p.title}
            {...preview}
          />
        </>
      ) : (
        <p>No hay documento adjunto.</p>
      )}
    </>
  );
}
