import { Button } from "../atoms/Button";
import { Input } from "../atoms/Input";
import { Link } from "react-router-dom";

export function CatalogHero({ query, setQuery, onSearch }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <h1>
          Las grandes ideas
          <br />
          merecen <em>ir más lejos.</em>
        </h1>
        <p className="hero-description">
          Descubre proyectos, conecta con nuevas perspectivas y comparte lo que
          estás creando.
        </p>
        <form className="hero-search" onSubmit={onSearch}>
          <label className="sr-only" htmlFor="home-search">
            Buscar en el repositorio
          </label>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <Input
            id="home-search"
            type="search"
            placeholder="¿Qué quieres descubrir hoy?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit">
            Explorar <span>↗</span>
          </Button>
        </form>
        <div className="hero-links">
          <Link to="/catalogo">Ver todos los proyectos →</Link>
          <span>Abierto a nuevas ideas.</span>
        </div>
      </div>
      <div className="hero-visual">
        <img
          className="hero-image"
          src="/academic-ideas.png"
          alt="Persona trabajando en una computadora con símbolos de ciencia, tecnología e innovación"
          width="457"
          height="364"
          fetchPriority="high"
        />
      </div>
    </section>
  );
}
