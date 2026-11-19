import { AuthContext } from "./AuthContext";
import { useEffect, useState } from "react";
import { api } from "../services/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setUser((await api("/auth/me")).user);
    } catch (e) {
      setUser(null);
      if (e.status !== 401) setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  return (
    <AuthContext.Provider value={{ user, setUser, loading, error, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
