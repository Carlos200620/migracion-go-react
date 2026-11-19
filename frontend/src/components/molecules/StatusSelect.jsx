import { Select } from "../atoms/Select";
import { labels } from "../../utils/projects";

export function StatusSelect({ value, onChange }) {
  return (
    <Select
      aria-label="Filtrar por estado"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Todos los estados</option>
      {Object.entries(labels).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </Select>
  );
}
