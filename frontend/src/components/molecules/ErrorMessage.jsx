import { Button } from "../atoms/Button";

export function ErrorMessage({ error, retry }) {
  return error ? (
    <div className="error" role="alert">
      {error}{" "}
      {retry && (
        <Button type="button" onClick={retry}>
          Reintentar
        </Button>
      )}
    </div>
  ) : null;
}
