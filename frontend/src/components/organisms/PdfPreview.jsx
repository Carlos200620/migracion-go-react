import { Button } from "../atoms/Button";
export function PdfPreview({
  url,
  title = "Documento PDF",
  open,
  onToggle,
  loading,
  error,
  source,
}) {
  return (
    <section className="pdf-preview" aria-label="Documento adjunto">
      <div className="pdf-toolbar">
        <Button className="secondary" onClick={onToggle} aria-expanded={open}>
          {open ? "Cerrar vista previa" : "Vista previa del PDF"}
        </Button>
        <a className="secondary" href={url}>
          Descargar PDF ↓
        </a>
      </div>
      {open && (
        <div className="pdf-viewer">
          {loading ? (
            <p role="status">Cargando documento…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            source && (
              <>
                <iframe src={source} title={"Vista previa: " + title} />
                <p className="pdf-fallback">
                  Si tu navegador no muestra el documento,{" "}
                  <a href={url}>descárgalo para leerlo</a>.
                </p>
              </>
            )
          )}
        </div>
      )}
    </section>
  );
}
