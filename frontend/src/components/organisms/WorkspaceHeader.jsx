import { UserIdentity } from "../molecules/UserIdentity";

export function WorkspaceHeader({ user, admin = false, actions }) {
  return (
    <header className="student-top">
      {actions}
      <UserIdentity user={user} admin={admin} />
    </header>
  );
}
