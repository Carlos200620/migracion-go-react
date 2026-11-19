import { Brand } from "../molecules/Brand";

export function PublicFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <Brand
          className="footer-brand"
          logoClassName="footer-logo"
          title="Repositorio de proyectos académicos"
        />
        <p className="footer-purpose">
          Proyectos, aprendizaje y conocimiento compartido.
        </p>
        <p className="footer-copyright">
          © {new Date().getFullYear()} Repositorio de proyectos · Uso académico
        </p>
      </div>
    </footer>
  );
}
