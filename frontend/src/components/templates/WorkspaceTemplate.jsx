import { useState, useEffect } from "react";
import { Button } from "../atoms/Button";
import { NotificationCenter } from "../organisms/NotificationCenter";
import { ErrorMessage } from "../molecules/ErrorMessage";

import { WorkspaceHeader } from "../organisms/WorkspaceHeader";
import { WorkspaceSidebar } from "../organisms/WorkspaceSidebar";

export function WorkspaceTemplate({
  admin = false,
  user,
  busy = false,
  error,
  onLogout,
  children,
  notifications,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  return (
    <div className="panel">
      <div className={"workspace " + (menuOpen ? "menu-open" : "")}>
        {menuOpen && (
          <Button
            className="drawer-backdrop"
            aria-label="Cerrar menú lateral"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <WorkspaceSidebar
          admin={admin}
          busy={busy}
          onLogout={onLogout}
          onNavigate={() => setMenuOpen(false)}
        />
        <div className="body">
          <div className="mobile-panel-bar">
            <Button
              className="mobile-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="workspace-navigation"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? "Cerrar menú ✕" : "☰ Menú"}
            </Button>
          </div>
          <WorkspaceHeader
            user={user}
            admin={admin}
            actions={notifications && <NotificationCenter {...notifications} />}
          />
          <main>
            <ErrorMessage error={error} />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
