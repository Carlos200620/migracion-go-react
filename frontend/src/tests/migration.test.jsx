import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { filterProjects } from "../utils/projects";

const project = {
  id: 1,
  title: "Proyecto de física",
  summary: "Átomos y energía",
  objectives: "Aprender",
  authors: "Carlos D",
  studentName: "Carlos D",
  year: 2026,
  category: "Física",
  categoryId: 1,
  status: "approved",
  createdAt: "2026-10-15T12:00:00Z",
  documentName: "informe.pdf",
  hasDocument: true,
  version: "v1",
};
function setup(path, user = null, routes = {}) {
  const requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      requests.push({ url, ...options });
      const parsed = new URL(url, "http://localhost"),
        base = parsed.pathname,
        query = parsed.searchParams;
      let data,
        status = 200;
      if (base === "/api/auth/me") {
        data = user ? { user } : { message: "Inicia sesión" };
        status = user ? 200 : 401;
      } else if (routes[base]) {
        const response =
          typeof routes[base] === "function"
            ? routes[base](options)
            : routes[base];
        data = response.data ?? response;
        status = typeof response.status === "number" ? response.status : 200;
      } else if (base === "/api/projects") data = [project];
      else if (base === "/api/categories") data = [{ id: 1, name: "Física" }];
      else if (base === "/api/admin/projects") data = [project];
      else if (base === "/api/admin/summary")
        data = { approved: 1, pending: 0, observed: 0 };
      else if (base === "/api/admin/project-filters")
        data = { categories: ["Física"], years: [2026] };
      else if (base === "/api/notifications")
        data = {
          items: [],
          unread: 0,
          total: 0,
          page: 1,
          pageSize: 5,
          totalPages: 1,
        };
      else if (base === "/api/auth/recovery-status") data = { enabled: true };
      else if (base === "/api/student/projects") data = [project];
      else if (base === "/api/admin/projects/1/history") data = [];
      else if (base.endsWith("/1")) data = project;
      else data = {};
      if (
        [
          "/api/projects",
          "/api/admin/projects",
          "/api/student/projects",
        ].includes(base) &&
        Array.isArray(data)
      ) {
        const selected = filterProjects(data, {
          query: query.get("q") || "",
          category: query.get("category") || "",
          year: query.get("year") || "",
          status: query.get("status") || "",
        });
        data = {
          items: selected,
          total: selected.length,
          page: Number(query.get("page") || 1),
          pageSize: Number(query.get("pageSize") || 12),
          totalPages: 1,
          filters: { categories: ["Física"], years: [2026] },
        };
      }
      return { ok: status < 400, status, json: async () => data };
    }),
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return requests;
}

const admin = { id: 2, fullName: "Leonidas", role: "admin" },
  student = { id: 1, fullName: "Carlos D", role: "student" };
describe("Migración de pantallas y permisos", () => {
  it("conserva la portada y la imagen enviada, sin el texto retirado", async () => {
    setup("/");
    expect(
      await screen.findByRole("heading", { name: /Las grandes ideas/ }),
    ).toBeTruthy();
    expect(screen.getByAltText(/Persona trabajando/).getAttribute("src")).toBe(
      "/academic-ideas.png",
    );
    expect(screen.queryByText(/EL CONOCIMIENTO SE COMPARTE/)).toBeNull();
    expect(await screen.findByText("Proyecto de física")).toBeTruthy();
  });
  it("busca sin tildes y combina categoría y año", () => {
    expect(
      filterProjects([project], {
        query: "fisica",
        category: "Física",
        year: "2026",
      }),
    ).toHaveLength(1);
    expect(filterProjects([project], { year: "2025" })).toHaveLength(0);
  });
  it("limpia filtros del catálogo y recupera proyectos", async () => {
    setup("/catalogo?q=imposible");
    expect(
      await screen.findByText(
        (_, element) =>
          element.tagName === "P" &&
          element.textContent === "0 proyectos encontrados",
      ),
    ).toBeTruthy();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Limpiar filtros" })[0],
    );
    expect(await screen.findByText("Proyecto de física")).toBeTruthy();
  });
  it("impide acceder al panel sin sesión", async () => {
    setup("/administracion");
    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeTruthy();
  });
  it("redirige un estudiante fuera del panel administrador", async () => {
    setup("/administracion", student);
    expect(
      await screen.findByRole("heading", { name: "Mis proyectos" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Resumen" })).toBeNull();
  });
  it("muestra el error de conexión de sesión sin confundirlo con cierre de sesión", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ message: "PostgreSQL no disponible" }),
      })),
    );
    render(
      <MemoryRouter initialEntries={["/administracion"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Iniciar sesión" }),
    ).toBeNull();
  });
  it("valida que las contraseñas de registro coincidan", async () => {
    const requests = setup("/crear-cuenta");
    await userEvent.type(screen.getByLabelText(/Nombre completo/), "Davis");
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      "davis@example.com",
    );
    await userEvent.type(screen.getByLabelText(/^Contraseña/), "Segura-123");
    await userEvent.type(
      screen.getByLabelText(/Confirmar contraseña/),
      "Diferente-123",
    );
    await userEvent.click(screen.getByRole("button", { name: /Crear cuenta/ }));
    expect(
      await screen.findByText("Las contraseñas no coinciden."),
    ).toBeTruthy();
    expect(requests.some((r) => r.url === "/api/auth/register")).toBe(false);
  });
  it("solo ofrece retirar y eliminar antes de retirar el proyecto", async () => {
    setup("/administracion/proyectos", admin);
    expect(await screen.findByRole("button", { name: "Retirar" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Eliminar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restaurar" })).toBeNull();
  });
  it("ofrece restaurar cuando está retirado", async () => {
    setup("/administracion/proyectos", admin, {
      "/api/admin/projects": [{ ...project, status: "withdrawn" }],
    });
    expect(
      await screen.findByRole("button", { name: "Restaurar" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retirar" })).toBeNull();
  });
  it("no elimina si el título de confirmación no coincide", async () => {
    const requests = setup("/administracion/proyectos", admin);
    await userEvent.click(
      await screen.findByRole("button", { name: "Eliminar" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText(/Motivo/),
      "Documento duplicado",
    );
    await userEvent.type(
      within(dialog).getByLabelText(/Escribe el título/),
      "distinto",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    );
    expect(
      await screen.findByText(
        "Escribe exactamente el título para confirmar la eliminación.",
      ),
    ).toBeTruthy();
    expect(requests.some((r) => r.url.includes("/lifecycle"))).toBe(false);
  });
  it("permite corregir proyectos observados y conserva el PDF actual", async () => {
    setup("/mis-proyectos/1/editar", student, {
      "/api/student/projects/1": {
        ...project,
        status: "observed",
        observations: "Revisar objetivos",
      },
    });
    expect(await screen.findByDisplayValue("Proyecto de física")).toBeTruthy();
    expect(screen.getByText(/Se conservará el documento actual/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Guardar y reenviar/ }),
    ).toBeTruthy();
  });
  it("la descarga pública apunta al PDF del proyecto", async () => {
    setup("/proyectos/1");
    expect(
      (await screen.findByRole("link", { name: /Descargar PDF/ })).getAttribute(
        "href",
      ),
    ).toBe("/api/projects/1/document");
  });
  it("abre el formulario de categoría y envía los datos", async () => {
    const requests = setup("/administracion/categorias", admin, {
      "/api/admin/categories": [],
    });
    await userEvent.click(
      await screen.findByRole("button", { name: /Nueva categoría/ }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Nombre/), "Software");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Guardar categoría" }),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.url === "/api/admin/categories" &&
            r.method === "POST" &&
            JSON.parse(r.body).name === "Software",
        ),
      ).toBe(true),
    );
  });
});
