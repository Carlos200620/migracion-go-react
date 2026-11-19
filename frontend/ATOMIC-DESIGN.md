# Atomic Design en el frontend

El frontend se organiza en cinco niveles de composición visual. Se conservan React, JavaScript, JSX y CSS; no se incorporaron TypeScript, Next.js ni una biblioteca de diseño. La reorganización no requiere cambios en la API Go, las tablas PostgreSQL, las cuentas ni los PDF.

## Estructura

```text
src/
├── components/
│   ├── atoms/       Button, Input, Textarea, Select, Badge, Logo
│   ├── molecules/   FormField, ErrorMessage, PdfPicker, Brand,
│   │               ProjectStatus, StatusSelect, UserIdentity
│   ├── organisms/   AuthForm, ProjectForm, ProjectCard, ProjectDetail,
│   │               CatalogHero, CatalogFilters, CategoryTable,
│   │               StudentProjectsTable, AdminActionDialog,
│   │               PublicHeader, PublicFooter, WorkspaceSidebar…
│   └── templates/   PublicLayout, AuthTemplate, CatalogTemplate,
│                   WorkspaceTemplate
├── pages/          CatalogPage, PublicationPage, AuthPage,
│                   StudentPage, AdminPage
├── context/        AuthContext y AuthProvider
├── hooks/          useAuth y useLogout
├── routes/         Guard
├── services/       api.js
├── utils/          estados, fechas y filtros
├── styles/         styles.css
├── tests/          pruebas de componentes y recorridos
├── App.jsx         composición de rutas
└── main.jsx        arranque de React
```

## Responsabilidades y ejemplos reales

| Nivel      | Responsabilidad                                                           | Ejemplo en este proyecto                                                                                                                            |
| ---------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Átomos     | Controles visuales básicos con propiedades estándar HTML.                 | `Button` conserva los eventos, el tipo y el estado deshabilitado. `Input` conserva validaciones y atributos de accesibilidad.                       |
| Moléculas  | Agrupan controles para una función concreta.                              | `FormField` combina etiqueta, ayuda y un control. `PdfPicker` agrupa selección, archivo actual, retirada y errores.                                 |
| Organismos | Secciones completas compuestas con los niveles anteriores.                | `ProjectForm` reúne campos, selección de categoría, PDF y acciones. `CategoryTable` presenta categorías y comunica las acciones mediante callbacks. |
| Plantillas | Definen la distribución sin cargar datos ni ejecutar acciones de negocio. | `WorkspaceTemplate` organiza menú, encabezado y contenido para ambos perfiles.                                                                      |
| Páginas    | Conectan datos, permisos, navegación y acciones con la interfaz.          | `StudentPage` consulta proyectos y envía formularios; `AuthPage` inicia sesión o registra una cuenta.                                               |

Por ejemplo, el formulario de acceso sigue esta composición:

```text
AuthPage
└── AuthTemplate
    └── AuthForm
        ├── FormField → Input
        ├── ErrorMessage → Button
        └── Button
```

El panel estudiantil sigue esta composición:

```text
StudentPage (datos y acciones)
└── WorkspaceTemplate
    ├── WorkspaceSidebar → Logo, Button
    ├── WorkspaceHeader → UserIdentity
    └── ProjectForm
        ├── FormField → Input / Textarea / Select
        ├── PdfPicker → Input, Button, ErrorMessage
        └── Button
```

## Reglas de dependencia

- Los átomos no importan moléculas, organismos, plantillas ni páginas.
- Las moléculas componen átomos y otras moléculas.
- Los organismos componen los niveles inferiores y otros organismos.
- Las plantillas distribuyen componentes visuales mediante propiedades y contenido.
- Las páginas pueden componer cualquiera de los niveles y usan servicios, contexto y hooks para coordinar la aplicación.
- Los componentes dentro de `components` no importan páginas, servicios HTTP, contexto de sesión, hooks de aplicación ni rutas protegidas. Reciben datos y callbacks.
- Un comportamiento visual como abrir un diálogo puede usar hooks de React dentro del organismo `Modal`; eso no equivale a cargar datos del servidor.

`services`, `context`, `hooks`, `routes` y `utils` son módulos auxiliares de aplicación, no niveles adicionales de Atomic Design. Esta metodología organiza la interfaz; el backend continúa en Go y la persistencia en PostgreSQL.

## Verificación

Desde la carpeta raíz:

```powershell
npm --prefix frontend run check:architecture
npm --prefix frontend test
npm --prefix frontend run build
```

La comprobación de arquitectura valida la dirección de los imports y la separación entre presentación y aplicación. Las pruebas cubren los recorridos previos de las páginas, el acceso por perfil, los filtros, las confirmaciones administrativas y la composición de los controles reutilizables. La versión actual incluye 27 pruebas de interfaz y componentes, con paginación, recuperación, vista previa, notificaciones y menú móvil.

El CSS conserva el contenido anterior y sus clases; el menú lateral y la imagen de portada se mantienen. Los comandos de arranque son los mismos: `go run .` dentro de `backend` y `npm run dev` dentro de `frontend`. También permanece disponible `npm start` desde la raíz.

La copia previa a esta reorganización está en `.cache/atomic-before`. El proyecto original Angular/Express y el respaldo anterior a la migración se conservan en sus carpetas independientes.

Las mejoras posteriores incorporan `Pagination`, `PdfPreview`, `NotificationCenter`, `PasswordRecoveryPage` y `NotificationsPage`. La consulta de notificaciones, las páginas de resultados y la obtención del PDF se coordinan en hooks separados de los organismos visuales. Consulta [MEJORAS.md](../MEJORAS.md).
