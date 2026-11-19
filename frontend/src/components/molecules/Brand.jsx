import { Link } from "react-router-dom";
import { Logo } from "../atoms/Logo";
export function Brand({
  className = "brand",
  logoClassName = "logo",
  title = "Repositorio de proyectos",
  subtitle = "Comunidad académica",
}) {
  return (
    <Link to="/" className={className}>
      <Logo className={logoClassName} />
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </Link>
  );
}
