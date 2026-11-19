import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../components/atoms/Button";
import { FormField } from "../components/molecules/FormField";
import { ErrorMessage } from "../components/molecules/ErrorMessage";
import { PdfPicker } from "../components/molecules/PdfPicker";
import { ProjectForm } from "../components/organisms/ProjectForm";
import { MemoryRouter } from "react-router-dom";

describe("Composición de controles reutilizables", () => {
  it("distingue las acciones de los envíos del formulario", async () => {
    const submit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <Button>Cancelar</Button>
        <Button type="submit">Enviar</Button>
        <Button disabled>Bloqueado</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Bloqueado" }));
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("asocia la etiqueta con el control y conserva sus restricciones", async () => {
    render(
      <FormField
        id="nombre"
        name="name"
        label="Nombre"
        hint="Máximo 5 caracteres."
        required
        maxLength={5}
      />,
    );
    const input = screen.getByLabelText(/Nombre/);
    await userEvent.type(input, "abcdef");
    expect(input.value).toBe("abcde");
    expect(input.required).toBe(true);
    expect(screen.getByText("Máximo 5 caracteres.")).toBeTruthy();
  });
  it("reintenta una operación sin enviar el formulario que contiene el aviso", async () => {
    const submit = vi.fn((e) => e.preventDefault()),
      retry = vi.fn();
    render(
      <form onSubmit={submit}>
        <ErrorMessage error="No se pudo cargar" retry={retry} />
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
  it("permite quitar el archivo seleccionado sin perder el formulario", async () => {
    const choose = vi.fn();
    render(
      <PdfPicker
        file={new File(["pdf"], "informe.pdf", { type: "application/pdf" })}
        onChoose={choose}
        onInvalidDrop={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Quitar archivo" }),
    );
    expect(choose).toHaveBeenCalledWith(null);
  });
  it("compone los campos y envía el proyecto una sola vez", async () => {
    const submit = vi.fn((e) => e.preventDefault());
    render(
      <MemoryRouter>
        <ProjectForm
          submit={submit}
          values={{
            title: "Informe",
            summary: "Resumen",
            objectives: "Objetivos",
            authors: "Davis",
            year: 2026,
            categoryId: 1,
          }}
          set={vi.fn()}
          categories={[{ id: 1, name: "Software" }]}
          loadCategories={vi.fn()}
          mode="new"
          file={new File(["pdf"], "informe.pdf")}
          choose={vi.fn()}
          setFile={vi.fn()}
          setFileError={vi.fn()}
          busy={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/Título del proyecto/).value).toBe("Informe");
    expect(screen.getByLabelText(/Resumen/).tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText(/Categoría/).value).toBe("1");
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar a revisión →" }),
    );
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
