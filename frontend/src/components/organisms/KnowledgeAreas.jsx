import { Link } from "react-router-dom";

import { tone } from "../../utils/projects";

export function KnowledgeAreas({ categories }) {
  return (
    <section className="areas">
      <div>
        <p className="eyebrow">SIGUE TU CURIOSIDAD</p>
        <h2>
          Un mundo de ideas,
          <br />
          muchas formas de explorarlo.
        </h2>
      </div>
      <div className="area-links">
        {categories.map((c) => (
          <Link key={c} to={"/catalogo?categoria=" + encodeURIComponent(c)}>
            <span className="area-dot" data-tone={tone(c)} />
            {c}
            <span className="area-arrow">↗</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
