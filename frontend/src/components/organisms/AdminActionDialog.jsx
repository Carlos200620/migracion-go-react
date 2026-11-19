import { Button } from "../atoms/Button";
import { Input } from "../atoms/Input";
import { Textarea } from "../atoms/Textarea";
import { ErrorMessage } from "../molecules/ErrorMessage";
import { Modal } from "./Modal";
import { actionLabels } from "../../utils/projects";

export function AdminActionDialog({
  modal,
  busy,
  onClose,
  saveModal,
  project,
  observations,
  modalError,
}) {
  return (
    <Modal
      title={
        modal.type === "category"
          ? modal.category
            ? "Editar categoría"
            : "Nueva categoría"
          : modal.type === "review"
            ? modal.decision === "approved"
              ? "¿Aprobar y publicar?"
              : "¿Devolver con observaciones?"
            : actionLabels[modal.action] + " proyecto"
      }
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={saveModal}>
        {modal.type === "category" ? (
          <>
            <label htmlFor="category-name">Nombre *</label>
            <Input
              id="category-name"
              name="name"
              required
              maxLength={100}
              autoFocus
              defaultValue={modal.category?.name || ""}
            />
            <label htmlFor="description">Descripción</label>
            <Textarea
              id="description"
              name="description"
              maxLength={1000}
              rows="3"
              defaultValue={modal.category?.description || ""}
            />
            <label className="checkbox-label">
              <Input
                type="checkbox"
                name="active"
                defaultChecked={modal.category?.active ?? true}
              />{" "}
              Categoría activa
            </label>
            <p className="info">
              Una categoría inactiva no se ofrece para nuevos envíos. Los
              proyectos existentes se conservan.
            </p>
          </>
        ) : modal.type === "review" ? (
          <>
            <strong>{project.title}</strong>
            <p>
              {modal.decision === "approved"
                ? "El proyecto y su PDF quedarán disponibles para consulta pública."
                : "El estudiante recibirá las observaciones y podrá corregir su proyecto."}
            </p>
            {modal.decision === "observed" && (
              <p className="multiline">{observations}</p>
            )}
          </>
        ) : (
          <>
            <strong>{modal.project.title}</strong>
            {modal.action === "delete" ? (
              <p className="delete-warning">
                Se eliminarán el proyecto y su PDF. Esta acción no permite
                restaurarlo.
              </p>
            ) : (
              <p>
                {modal.action === "withdraw"
                  ? "Dejará de estar disponible públicamente. El proyecto y su PDF se conservan."
                  : "Volverá a estar disponible en el catálogo público."}
              </p>
            )}
            <label htmlFor="reason">Motivo *</label>
            <Textarea
              id="reason"
              name="reason"
              required
              maxLength={1000}
              rows="3"
              autoFocus
            />
            {modal.action === "delete" && (
              <>
                <label htmlFor="confirmation">
                  Escribe el título exacto para confirmar
                </label>
                <Input
                  id="confirmation"
                  name="confirmation"
                  required
                  autoComplete="off"
                />
              </>
            )}
          </>
        )}
        <ErrorMessage error={modalError} />
        <div className="form-actions">
          <Button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className={
              "primary " + (modal.action === "delete" ? "danger-button" : "")
            }
            disabled={busy}
          >
            {busy
              ? "Guardando…"
              : modal.type === "category"
                ? "Guardar categoría"
                : "Confirmar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
