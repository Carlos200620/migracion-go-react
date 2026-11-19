export function CatalogTemplate({ fullCatalog = false, children }) {
  return (
    <div className="catalog">
      <main className={fullCatalog ? "catalog-page" : ""}>{children}</main>
    </div>
  );
}
