import { Button } from "../atoms/Button";
export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  loading = false,
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <Button
        className="secondary"
        disabled={loading || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ← Anterior
      </Button>
      <span role="status">
        Página {page} de {totalPages} · {total} resultados
      </span>
      <Button
        className="secondary"
        disabled={loading || page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Siguiente →
      </Button>
    </nav>
  );
}
