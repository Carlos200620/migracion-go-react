import { Button } from "../atoms/Button";

export function CategoryTable({ categories, busy, onEdit, onToggle }) {
  return (
    <section className="table-card category-table">
      <div className="table-scroll">
        <table className="categories-table">
          <thead>
            <tr>
              <th>NOMBRE</th>
              <th>DESCRIPCIÓN</th>
              <th>PROYECTOS</th>
              <th>ESTADO</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td data-label="NOMBRE">
                  <strong>{c.name}</strong>
                </td>
                <td data-label="DESCRIPCIÓN">{c.description}</td>
                <td data-label="PROYECTOS">{c.projectCount}</td>
                <td data-label="ESTADO">
                  <span
                    className={"badge " + (c.active ? "approved" : "inactive")}
                  >
                    {c.active ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td data-label="ACCIONES">
                  <div className="actions">
                    <Button
                      type="submit"
                      className="text-action"
                      disabled={busy}
                      onClick={() => onEdit(c)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="submit"
                      className="text-action"
                      disabled={busy}
                      onClick={() => onToggle(c)}
                    >
                      {c.active ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!categories.length && (
              <tr>
                <td colSpan="5" className="empty">
                  Todavía no hay categorías. Pulsa Nueva categoría para
                  comenzar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
