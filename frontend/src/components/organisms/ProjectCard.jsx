import { Link } from "react-router-dom";

import { tone } from "../../utils/projects";

export function ProjectCard({ p }) {
  return (
    <article data-tone={tone(p.category)}>
      <Link
        className="project-cover"
        to={"/proyectos/" + p.id}
        aria-label={"Ver proyecto: " + p.title}
      >
        <span className="cover-category">{p.category}</span>
        <svg aria-hidden="true" viewBox="0 0 240 110">
          <path
            className="cover-orbit"
            d="M30 70Q120-35 210 70M30 40Q120 145 210 40"
          />
          <circle cx="120" cy="55" r="29" />
          <path d="M100 39h16q8 0 8 8v30q-8-8-24-5ZM140 39h-8q-8 0-8 8v30q8-8 16-5Z" />
          <circle cx="39" cy="58" r="5" />
          <circle cx="202" cy="53" r="5" />
        </svg>
        <span className="cover-arrow">↗</span>
      </Link>
      <div className="card-body">
        <div className="tags">
          <span>{p.category}</span>
          <span>{p.year}</span>
        </div>
        <h3>{p.title}</h3>
        <p className="summary">{p.summary}</p>
        <div className="card-footer">
          <div>
            <strong>Autores</strong>
            <p>{p.authors}</p>
          </div>
          <Link to={"/proyectos/" + p.id}>Ver proyecto ↗</Link>
        </div>
      </div>
    </article>
  );
}
