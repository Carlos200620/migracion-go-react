import { Link } from "react-router-dom";
import { Button } from "../atoms/Button";
import { FormField } from "../molecules/FormField";
import { ErrorMessage } from "../molecules/ErrorMessage";
import { PdfPicker } from "../molecules/PdfPicker";

export function ProjectForm({
  submit,
  values,
  set,
  categories,
  categoryError,
  loadCategories,
  mode,
  project,
  file,
  fileError,
  choose,
  setFile,
  setFileError,
  busy,
}) {
  return (
    <form className="form-card" onSubmit={submit}>
      <FormField
        id="title"
        label="Título del proyecto"
        hint="Máximo 200 caracteres."
        required
        maxLength={200}
        value={values.title}
        onChange={(e) => set("title", e.target.value)}
      />
      {[
        ["summary", "Resumen"],
        ["objectives", "Objetivos"],
      ].map(([key, label]) => (
        <FormField
          key={key}
          id={key}
          label={label}
          hint="Máximo 10 000 caracteres."
          as="textarea"
          rows="5"
          required
          maxLength={10000}
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      ))}
      <FormField
        id="authors"
        label="Autores"
        required
        maxLength={500}
        value={values.authors}
        onChange={(e) => set("authors", e.target.value)}
      />
      <div className="form-row">
        <div>
          <FormField
            id="category"
            label="Categoría"
            as="select"
            required
            value={values.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
          >
            <option value="" disabled>
              Selecciona una categoría
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FormField>
        </div>
        <div>
          <FormField
            id="year"
            label="Año"
            type="number"
            required
            min={1900}
            max={2100}
            value={values.year}
            onChange={(e) => set("year", e.target.value)}
          />
        </div>
      </div>
      <ErrorMessage error={categoryError} retry={loadCategories} />
      <PdfPicker
        required={mode === "new"}
        file={file}
        error={fileError}
        currentDocumentName={project?.documentName}
        onChoose={choose}
        onInvalidDrop={() => {
          setFile(null);
          setFileError("Selecciona un solo documento PDF.");
        }}
      />
      <p className="info">
        El proyecto quedará pendiente de revisión y no se publicará hasta su
        aprobación.
      </p>
      <div className="form-actions">
        <Link className="secondary" to="/mis-proyectos">
          Cancelar
        </Link>
        <Button
          type="submit"
          className="primary"
          disabled={busy || !categories.length}
        >
          {busy
            ? "Enviando…"
            : mode === "edit"
              ? "Guardar y reenviar →"
              : "Enviar a revisión →"}
        </Button>
      </div>
    </form>
  );
}
