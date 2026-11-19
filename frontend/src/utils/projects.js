export const labels = {
  pending: "Pendiente de revisión",
  observed: "Observado",
  approved: "Aprobado",
  withdrawn: "Retirado",
};
export const actionLabels = {
  withdraw: "Retirar",
  restore: "Restaurar",
  delete: "Eliminar",
};
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const date = (value) => new Date(value).toLocaleDateString("es-PE");
export function localDay(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function filterProjects(
  projects,
  {
    query = "",
    category = "",
    year = "",
    status = "",
    from = "",
    to = "",
  } = {},
) {
  return projects.filter(
    (p) =>
      (!category || category === "Todas" || p.category === category) &&
      (!year || String(p.year) === String(year)) &&
      (!status || p.status === status) &&
      normalize(
        `${p.title} ${p.authors || ""} ${p.summary || ""} ${p.studentName || ""}`,
      ).includes(normalize(query.trim())) &&
      (!from || localDay(p.createdAt) >= from) &&
      (!to || localDay(p.createdAt) <= to),
  );
}

export const tone = (value) =>
  Array.from(value).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4;
