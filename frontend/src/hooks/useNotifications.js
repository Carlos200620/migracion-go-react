import { useEffect, useState, useRef } from "react";
import { api } from "../services/api";
export function useNotifications(user) {
  const activeRequest = useRef(null);
  const [data, setData] = useState({ items: [], unread: 0, total: 0 }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    if (!user) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const result = await api("/notifications?pageSize=5", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    }
  }
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (!stopped && document.visibilityState !== "hidden") await refresh();
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => {
      stopped = true;
      activeRequest.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [user?.id]);
  async function read(id) {
    setBusy(true);
    try {
      await api("/notifications/" + id + "/read", {
        method: "PATCH",
        body: {},
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function readAll() {
    setBusy(true);
    try {
      await api("/notifications/read-all", { method: "PATCH", body: {} });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return { ...data, error, busy, refresh, read, readAll };
}
