import { Input } from "../atoms/Input";
import { Button } from "../atoms/Button";
import { ErrorMessage } from "./ErrorMessage";

export function PdfPicker({
  required = false,
  file,
  error,
  currentDocumentName,
  onChoose,
  onInvalidDrop,
}) {
  return (
    <>
      <label htmlFor="document">
        Documento PDF {required ? "*" : "(opcional si conservas el actual)"}
      </label>
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length !== 1) onInvalidDrop();
          else onChoose(e.dataTransfer.files[0]);
        }}
      >
        <p>Arrastra aquí un PDF o selecciónalo desde tu equipo.</p>
        <Input
          id="document"
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            onChoose(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <small>Un archivo PDF de hasta 10 MB.</small>
      </div>
      {file ? (
        <div className="file-selected">
          <span>{file.name}</span>
          <Button onClick={() => onChoose(null)}>Quitar archivo</Button>
        </div>
      ) : (
        currentDocumentName && (
          <p className="info">
            Se conservará el documento actual: {currentDocumentName}
          </p>
        )
      )}
      <ErrorMessage error={error} />
    </>
  );
}
