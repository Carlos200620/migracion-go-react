import { Link } from "react-router-dom";

export function CommunityCallout({}) {
  return (
    <section className="community">
      <div>
        <p className="eyebrow">COMUNIDAD ESTUDIANTIL</p>
        <h2>
          Tu idea también
          <br />
          merece un lugar aquí.
        </h2>
        <p>
          Regístralo y contribuye al conocimiento de nuestra comunidad
          académica.
        </p>
      </div>
      <Link className="community-action" to="/crear-cuenta">
        Crear cuenta
      </Link>
    </section>
  );
}
