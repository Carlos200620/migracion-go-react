import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";

const fixture = {
  id: 1,
  title: "Proyecto publicado",
  summary: "Resumen",
  objectives: "Objetivos",
  authors: "Davis",
  year: 2026,
  category: "Software",
  status: "approved",
  createdAt: "2026-10-15",
  hasDocument: true,
  documentName: "informe.pdf",
};
function setup(
  path,
  { user = null, recovery = true, notices = [], pdfStatus = 200 } = {},
) {
  const requests = [];
  const create = vi.fn(() => "blob:pdf-prueba"),
    revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: create,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revoke,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      requests.push({ url, ...options });
      const u = new URL(url, "http://localhost"),
        p = u.pathname,
        query = u.searchParams;
      let data = {},
        status = 200;
      if (p === "/api/auth/me") {
        status = user ? 200 : 401;
        data = user ? { user } : { message: "Inicia sesión" };
      } else if (p === "/api/auth/recovery-status")
        data = { enabled: recovery };
      else if (p === "/api/auth/request-code")
        data = {
          message: "Si el correo está registrado, recibirás un código.",
        };
      else if (p === "/api/auth/reset-password" || p === "/api/auth/reset-with-code")
        data = { message: "Contraseña actualizada. Inicia sesión nuevamente." };
      else if (p === "/api/notifications")
        data = {
          items: notices,
          unread: notices.filter((n) => !n.readAt).length,
          total: notices.length,
          page: 1,
          pageSize: 5,
          totalPages: 1,
        };
      else if (
        p === "/api/projects" ||
        p === "/api/student/projects" ||
        p === "/api/admin/projects"
      ) {
        const page = Number(query.get("page") || 1);
        data = {
          items: [
            {
              ...fixture,
              title: page === 1 ? fixture.title : "Proyecto de segunda página",
            },
          ],
          total: 25,
          page,
          pageSize: 12,
          totalPages: 3,
          filters: { categories: ["Software"], years: [2026] },
        };
      } else if (p === "/api/projects/1") data = fixture;
      else if (p.endsWith("/document"))
        return {
          ok: pdfStatus === 200,
          status: pdfStatus,
          headers: { get: () => "application/pdf" },
          blob: async () =>
            new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
        };
      return { ok: status < 400, status, json: async () => data };
    }),
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return { requests, create, revoke };
}
describe("Mejoras del repositorio", () => {
  it("pide otra página al backend y muestra el total del servidor", async () => {
    const { requests } = setup("/catalogo");
    expect(await screen.findByText("Proyecto publicado")).toBeTruthy();
    expect(screen.getByText("Página 1 de 3 · 25 resultados")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(await screen.findByText("Proyecto de segunda página")).toBeTruthy();
    expect(requests.some((r) => r.url.includes("page=2"))).toBe(true);
  });
  it("envía la búsqueda a Go y vuelve a la primera página al cambiar filtros", async () => {
    const { requests } = setup("/catalogo");
    await userEvent.click(
      await screen.findByRole("button", { name: "Siguiente →" }),
    );
    await screen.findByText("Proyecto de segunda página");
    await userEvent.type(
      screen.getByPlaceholderText("Buscar por título, autor o palabra clave"),
      "energía",
    );
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.url.includes("q=energ%C3%ADa") && r.url.includes("page=1"),
        ),
      ).toBe(true),
    );
  });
  it.each(["/iniciar-sesion", "/recuperar-contrasena", "/restablecer-contrasena#token=anterior"])("mantiene el acceso sin recuperación de contraseña: %s", async (path) => {
    const { requests } = setup(path);
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "¿Olvidaste tu contraseña?" })).toBeNull();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toBeTruthy();
    expect(requests.some(r => /recovery-status|request-code|reset-password|reset-with-code/.test(r.url))).toBe(false);
  });
  it("carga el PDF autorizado y libera la vista previa al cerrarla", async () => {
    const { requests, create, revoke } = setup("/proyectos/1");
    await userEvent.click(
      await screen.findByRole("button", { name: "Vista previa del PDF" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByTitle("Vista previa: Proyecto publicado")
          .getAttribute("src"),
      ).toBe("blob:pdf-prueba"),
    );
    expect(
      requests.some((r) => r.url === "/api/projects/1/document?inline=1"),
    ).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar vista previa" }),
    );
    expect(revoke).toHaveBeenCalledWith("blob:pdf-prueba");
  });
  it("muestra un error de vista previa si el proyecto ya no está disponible", async () => {
    setup("/proyectos/1", { pdfStatus: 404 });
    await userEvent.click(
      await screen.findByRole("button", { name: "Vista previa del PDF" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTitle("Vista previa: Proyecto publicado")).toBeNull();
  });
  it("muestra notificaciones y permite marcarlas como leídas", async () => {
    const { requests } = setup("/mis-proyectos", {
      user: { id: 1, fullName: "Davis", role: "student" },
      notices: [
        {
          id: 4,
          projectId: 1,
          projectTitle: "Proyecto publicado",
          kind: "approved",
          message: "Tu proyecto fue aprobado.",
          createdAt: "2026-11-03T12:00:00Z",
          readAt: null,
        },
      ],
    });
    await userEvent.click(
      await screen.findByLabelText("Notificaciones: 1 sin leer"),
    );
    expect(await screen.findByText("Tu proyecto fue aprobado.")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Marcar como leída" }),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.url === "/api/notifications/4/read" && r.method === "PATCH",
        ),
      ).toBe(true),
    );
  });
  it("abre y cierra el menú compacto con Escape", async () => {
    setup("/mis-proyectos", {
      user: { id: 1, fullName: "Davis", role: "student" },
    });
    const toggle = await screen.findByRole("button", { name: "☰ Menú" });
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
