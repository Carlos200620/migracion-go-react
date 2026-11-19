export function UserIdentity({ user, admin = false }) {
  const initials = user.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <>
      <div>
        <strong>Hola, {user.fullName}</strong>
        <small>{admin ? "Administrador" : "Estudiante"}</small>
      </div>
      <span className="avatar">{initials}</span>
    </>
  );
}
