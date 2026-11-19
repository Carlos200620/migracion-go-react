import { Button } from "../atoms/Button";
import { Input } from "../atoms/Input";

import { Select } from "../atoms/Select";

export function CatalogFilters({
  query,
  setQuery,
  category,
  setCategory,
  year,
  setYear,
  categories,
  years,
  clear,
}) {
  return (
    <div className="filters">
      <label className="search-label">
        <span className="sr-only">Buscar proyectos</span>
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <Input
          type="search"
          placeholder="Buscar por título, autor o palabra clave"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        Categoría
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>Todas</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </label>
      <label>
        Año
        <Select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Todos</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" className="clear" onClick={clear}>
        Limpiar filtros
      </Button>
    </div>
  );
}
