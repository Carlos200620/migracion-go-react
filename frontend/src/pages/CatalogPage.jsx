import { usePagedProjects } from "../hooks/usePagedProjects";
import { Pagination } from "../components/molecules/Pagination";
import { CommunityCallout } from "../components/organisms/CommunityCallout";
import { KnowledgeAreas } from "../components/organisms/KnowledgeAreas";
import { CatalogFilters } from "../components/organisms/CatalogFilters";
import { CatalogHero } from "../components/organisms/CatalogHero";
import { Button } from "../components/atoms/Button";
import { CatalogTemplate } from "../components/templates/CatalogTemplate";
import { ErrorMessage } from "../components/molecules/ErrorMessage";

import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ProjectCard } from "../components/organisms/ProjectCard";
import { useEffect, useState } from "react";

import { api } from "../services/api";
import { filterProjects } from "../utils/projects";

export function CatalogPage({ fullCatalog = false }) {
  const [searchParams] = useSearchParams(),
    navigate = useNavigate();
  const [query, setQuery] = useState(searchParams.get("q") || ""),
    [category, setCategory] = useState(
      searchParams.get("categoria") || "Todas",
    ),
    [year, setYear] = useState("");
  const data = usePagedProjects("/projects", {
    q: fullCatalog ? query : "",
    category: fullCatalog ? category : "",
    year: fullCatalog ? year : "",
    pageSize: fullCatalog ? 12 : 3,
  });
  const projects = data.items,
    filtered = projects,
    loading = data.loading,
    error = data.error,
    load = data.reload,
    categories = data.filters?.categories || [],
    years = data.filters?.years || [];
  useEffect(() => {
    setQuery(searchParams.get("q") || "");
    setCategory(searchParams.get("categoria") || "Todas");
    setYear("");
  }, [searchParams, fullCatalog]);
  function clear() {
    setQuery("");
    setCategory("Todas");
    setYear("");
  }
  return (
    <CatalogTemplate fullCatalog={fullCatalog}>
      {fullCatalog ? (
        <section className="catalog-intro">
          <span className="catalog-decoration" aria-hidden="true">
            ✳
          </span>
          <p className="eyebrow">LA BIBLIOTECA DE NUESTRAS IDEAS</p>
          <h1>
            Encuentra tu próxima <em>inspiración.</em>
          </h1>
          <p>Descubre proyectos creados por nuestra comunidad académica.</p>
        </section>
      ) : (
        <>
          <CatalogHero
            query={query}
            setQuery={setQuery}
            onSearch={(e) => {
              e.preventDefault();
              navigate(
                "/catalogo" +
                  (query.trim()
                    ? "?q=" + encodeURIComponent(query.trim())
                    : ""),
              );
            }}
          />
          <div className="intro-strip">
            <span>Un espacio para el conocimiento colectivo</span>
            <div>
              <span>01 / Explora</span>
              <span>02 / Aprende</span>
              <span>03 / Comparte</span>
            </div>
          </div>
        </>
      )}
      <section id="catalogo" aria-label="Proyectos publicados">
        {fullCatalog ? (
          <>
            <CatalogFilters
              query={query}
              setQuery={setQuery}
              category={category}
              setCategory={setCategory}
              year={year}
              setYear={setYear}
              categories={categories}
              years={years}
              clear={clear}
            />
            {!loading && !error && (
              <div className="results">
                <p>
                  <strong>{data.total}</strong>{" "}
                  {data.total === 1
                    ? "proyecto encontrado"
                    : "proyectos encontrados"}
                </p>
                <small>Solo se muestran proyectos aprobados</small>
              </div>
            )}
          </>
        ) : (
          <div className="section-heading">
            <div>
              <p className="eyebrow">RECIÉN PUBLICADOS</p>
              <h2>Ideas que ya están tomando forma.</h2>
              <p className="section-note">
                Conoce los últimos proyectos de nuestra comunidad.
              </p>
            </div>
            <Link to="/catalogo">Ver todos →</Link>
          </div>
        )}
        {loading ? (
          <p role="status">Cargando proyectos…</p>
        ) : error ? (
          <ErrorMessage error={error} retry={load} />
        ) : (
          <div className={"grid " + (fullCatalog ? "catalog-grid" : "")}>
            {(fullCatalog ? filtered : projects.slice(0, 3)).map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
            {!(fullCatalog ? filtered : projects).length && (
              <div className="empty">
                <h2>
                  No hay proyectos publicados que coincidan con tu búsqueda.
                </h2>
                <p>
                  {fullCatalog
                    ? "Prueba otra búsqueda o restablece los filtros."
                    : "Los proyectos aparecerán aquí cuando sean aprobados."}
                </p>
                {fullCatalog && (
                  <Button type="submit" onClick={clear}>
                    Limpiar filtros
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      {fullCatalog && !loading && !error && (
        <Pagination {...data} onPage={data.setPage} />
      )}
      {!fullCatalog && (
        <>
          {!!categories.length && <KnowledgeAreas categories={categories} />}
          <CommunityCallout />
        </>
      )}
    </CatalogTemplate>
  );
}
