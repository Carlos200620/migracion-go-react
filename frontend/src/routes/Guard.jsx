import { ErrorMessage } from "../components/molecules/ErrorMessage";
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

export function Guard({ role }) {
  const auth = useAuth();
  if (auth.loading) return <p role="status">Comprobando sesión…</p>;
  if (auth.error)
    return <ErrorMessage error={auth.error} retry={auth.refresh} />;
  if (!auth.user) return <Navigate to="/iniciar-sesion" replace />;
  if (role && auth.user.role !== role)
    return (
      <Navigate
        to={auth.user.role === "admin" ? "/administracion" : "/mis-proyectos"}
        replace
      />
    );
  return <Outlet />;
}
