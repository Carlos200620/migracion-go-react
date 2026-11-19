export function Badge({ variant = "", children }) {
  return (
    <span className={["badge", variant].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}
