import { NotificationsPage } from "./pages/NotificationsPage";
import { AdminPage } from "./pages/AdminPage";
import { AuthPage } from "./pages/AuthPage";
import { AuthProvider } from "./context/AuthProvider";
import { CatalogPage } from "./pages/CatalogPage";
import { Guard } from "./routes/Guard";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { PublicLayout } from "./components/templates/PublicLayout";
import { PublicationPage } from "./pages/PublicationPage";
import { useEffect } from "react";
import { StudentPage } from "./pages/StudentPage";
import { useAuth } from "./hooks/useAuth";
import "./styles/styles.css";
import "./styles/improvements.css";

export function App() {
  return (
    <AuthProvider>
      <ScrollTop />
      <Routes>
        <Route element={<PublicRoutes />}>
          <Route index element={<CatalogPage />} />
          <Route path="catalogo" element={<CatalogPage fullCatalog />} />
          <Route path="proyectos/:id" element={<PublicationPage />} />
        </Route>
        <Route path="iniciar-sesion" element={<AuthPage key="login" />} />
        <Route
          path="crear-cuenta"
          element={<AuthPage register key="register" />}
        />
        <Route element={<Guard role="student" />}>
          <Route path="mis-proyectos/*" element={<StudentPage />} />
        </Route>
        <Route element={<Guard role="admin" />}>
          <Route path="administracion/*" element={<AdminPage />} />
        </Route>
        <Route
          path="recuperar-contrasena"
          element={<Navigate to="/iniciar-sesion" replace />}
        />
        <Route
          path="restablecer-contrasena"
          element={<Navigate to="/iniciar-sesion" replace />}
        />
        <Route element={<Guard />}>
          <Route path="notificaciones" element={<NotificationsPage />} />
          <Route path="mi-cuenta" element={<AccountRedirect />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AccountRedirect() {
  const { user } = useAuth();
  return (
    <Navigate
      replace
      to={user.role === "admin" ? "/administracion" : "/mis-proyectos"}
    />
  );
}

function PublicRoutes() {
  const { user } = useAuth();
  return (
    <PublicLayout user={user}>
      <Outlet />
    </PublicLayout>
  );
}
