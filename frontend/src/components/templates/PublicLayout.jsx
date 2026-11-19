import { PublicFooter } from "../organisms/PublicFooter";
import { PublicHeader } from "../organisms/PublicHeader";

export function PublicLayout({ user, children }) {
  return (
    <div className="public-shell">
      <PublicHeader user={user} />
      {children}
      <PublicFooter />
    </div>
  );
}
