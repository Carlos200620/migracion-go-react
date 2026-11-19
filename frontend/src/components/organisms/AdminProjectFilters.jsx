import { Input } from "../atoms/Input";

import { Select } from "../atoms/Select";
import { StatusSelect } from "../molecules/StatusSelect";

export function AdminProjectFilters({ filters, setFilter, categoryNames }) {
  return (
    <div className="admin-filters">
      <label>
        Buscar
        <Input
          type="search"
          placeholder="Título o estudiante"
          value={filters.query}
          onChange={(e) => setFilter("query", e.target.value)}
        />
      </label>
      <label>
        Estado
        <StatusSelect
          value={filters.status}
          onChange={(v) => setFilter("status", v)}
        />
      </label>
      <label>
        Categoría
        <Select
          value={filters.category}
          onChange={(e) => setFilter("category", e.target.value)}
        >
          <option value="">Todas</option>
          {categoryNames.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </label>
      {[
        ["from", "Desde"],
        ["to", "Hasta"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          <Input
            type="date"
            value={filters[key]}
            onChange={(e) => setFilter(key, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
