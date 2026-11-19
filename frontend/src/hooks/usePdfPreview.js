import { useEffect, useState } from "react";
export function usePdfPreview(url) {
  const [open, setOpen] = useState(false),
    [state, setState] = useState({ loading: false, error: "", source: "" });
  useEffect(() => {
    if (!open || !url) return;
    const controller = new AbortController();
    let objectUrl = "",
      live = true;
    setState({ loading: true, error: "", source: "" });
    fetch(url + "?inline=1", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            response.status === 401
              ? "Tu sesión terminó. Inicia sesión nuevamente."
              : "El documento no está disponible para su consulta.",
          );
        if (!response.headers.get("content-type")?.includes("application/pdf"))
          throw Error("La respuesta no es un PDF.");
        return response.blob();
      })
      .then((blob) => {
        if (live) {
          objectUrl = URL.createObjectURL(blob);
          setState({ loading: false, error: "", source: objectUrl });
        }
      })
      .catch((e) => {
        if (live && e.name !== "AbortError")
          setState({ loading: false, error: e.message, source: "" });
      });
    return () => {
      live = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url]);
  return { ...state, open, onToggle: () => setOpen((v) => !v) };
}
