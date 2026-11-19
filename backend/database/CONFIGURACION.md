# Configurar PostgreSQL localmente

Estado: esquema preparado; aún no aplicado a ninguna base de datos.

1. Abre pgAdmin y conecta con tu servidor PostgreSQL. Si no conecta, verifica el servicio y el puerto de la instalación. No reinstales PostgreSQL.
2. Crea una base de datos vacía llamada `repositorio_proyectos`.
3. En esa base, abre Query Tool y ejecuta el archivo `server/database/001_initial.sql`. Está dentro de una transacción y crea tablas sin borrar datos.
4. Copia `server/.env.example` como `server/.env`. Completa host, puerto, usuario y contraseña de tu instalación local. No compartas este archivo ni la contraseña en el chat.
5. Reinicia la API desde la carpeta server con `npm.cmd run dev`.
6. Abre http://localhost:3000/api/health/database. Debe responder con `database: connected`.
7. Reinicia Angular con `npm.cmd start` desde la raíz del proyecto para activar el proxy de /api.

El esquema crea categorías, pero no incluye usuarios ni proyectos de ejemplo. Un catálogo vacío es correcto hasta implementar y usar el registro y la aprobación de proyectos.

## Relaciones

- Un usuario puede ser propietario de varios proyectos.
- Una categoría agrupa varios proyectos.
- Un proyecto admite un documento PDF de hasta 10 MB.
- Un administrador puede revisar varios proyectos.
- Los estados son pending, observed y approved.
- El catálogo público solo consulta proyectos approved. No expone contraseñas, observaciones privadas ni ubicaciones de archivos.

## API actual

- GET /api/health: estado del proceso; no comprueba la base de datos.
- GET /api/health/database: conectividad PostgreSQL.
- GET /api/projects: hasta 200 proyectos aprobados, más recientes primero.
- GET /api/projects/:id: detalle público de un proyecto aprobado.
- GET /api/categories: categorías activas.

Todavía no están implementados autenticación, escrituras, revisión ni descarga de PDF. El esquema no sustituye los controles de permisos que se implementarán en la API.
