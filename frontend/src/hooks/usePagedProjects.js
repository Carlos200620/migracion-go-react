import { useEffect, useState } from "react";
import { api } from "../services/api";

export function usePagedProjects(endpoint, filters = {}, enabled = true) {
  const [cursor, setCursor] = useState({ key: "", page: 1 }),
    [revision, setRevision] = useState(0);
  const key = JSON.stringify(filters),
    page = cursor.key === key ? cursor.page : 1;
  const [state, setState] = useState({
    items: [],
    total: 0,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    filters: { categories: [], years: [] },
    loading: enabled,
    error: "",
    errorStatus: 0,
  });
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v !== "" && v != null && v !== "Todas") params.set(k, String(v));
  params.set("page", String(page));
  const query = params.toString();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    const timer = setTimeout(
      async () => {
        try {
          const result = await api(endpoint + "?" + query, {
            signal: controller.signal,
          });
          if (live) setState({ ...result, loading: false, error: "" });
        } catch (e) {
          if (live && e.name !== "AbortError")
            setState((s) => ({
              ...s,
              loading: false,
              error: e.message,
              errorStatus: e.status || 0,
            }));
        }
      },
      filters.q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, query, enabled, revision]);
  return {
    ...state,
    setPage: (p) => setCursor({ key, page: p }),
    reload: () => setRevision((v) => v + 1),
  };
}
