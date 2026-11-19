import { useState } from "react";
import { api } from "../services/api";
import { useAuth } from "./useAuth";
import { useNavigate } from "react-router-dom";

export function useLogout() {
  const { setUser } = useAuth(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      setUser(null);
      navigate("/iniciar-sesion");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, logout };
}
