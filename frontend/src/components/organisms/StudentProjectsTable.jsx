import { Link } from "react-router-dom";
import { ProjectStatus } from "../molecules/ProjectStatus";

import { StatusSelect } from "../molecules/StatusSelect";
import { date } from "../../utils/projects";

export function StudentProjectsTable({
  filtered,
  total = filtered.length,
  projects,
  status,
  setStatus,
}) {
  return (
    <section className="table-card">
      <div className="table-toolbar">
        <strong>
          {total} {total === 1 ? "proyecto" : "proyectos"}
        </strong>
        <StatusSelect value={status} onChange={setStatus} />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>PROYECTO</th>
              <th>FECHA DE ENVÍO</th>
              <th>ESTADO</th>
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
                <td data-label="FECHA DE ENVÍO">{date(p.createdAt)}</td>
                <td data-label="ESTADO">
                  <ProjectStatus status={p.status} />
                </td>
                <td data-label="ACCIONES">
                  <div className="actions">
                    <Link to={"/mis-proyectos/" + p.id}>Ver detalle</Link>
                    {p.status === "observed" && (
                      <Link to={"/mis-proyectos/" + p.id + "/editar"}>
                        Editar y reenviar
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan="4">
                  <div className="empty">
                    <h2>
                      {projects.length
                        ? "No hay proyectos con este estado"
                        : "Aún no has registrado proyectos"}
                    </h2>
                    <p>
                      {projects.length
                        ? "Selecciona otro estado."
                        : "Comparte tu primer proyecto con la comunidad académica."}
                    </p>
                    {!status && (
                      <Link to="/mis-proyectos/nuevo">
                        Registrar mi primer proyecto →
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
