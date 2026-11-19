# Repositorio de proyectos académicos

Proyecto de Davis con Angular 21, Express, TypeScript y PostgreSQL.

## Ejecutar

Desde la raíz: `npm.cmd start` y abrir http://localhost:4200.
Desde server, en otra terminal: `npm.cmd run dev`.
Las sesiones temporales se cierran al reiniciar la API.

## Funciones actuales

- Catálogo de proyectos aprobados, búsqueda local, filtro por categoría y detalle público navegable.
- Descarga pública del PDF únicamente cuando el proyecto está aprobado.
- Registro de estudiantes, inicio y cierre de sesión, contraseñas con scrypt y cookie HttpOnly.
- Área estudiantil /mis-proyectos: listado, filtros, registro con PDF de hasta 10 MB, detalle y descarga privada.
- Corrección y reenvío solo de proyectos observados; un estudiante solo accede a sus propios envíos.
- Área administrativa /administracion: cantidades reales por estado y últimos proyectos pendientes.
- Lista administrativa con búsqueda por título/estudiante y filtros por estado, categoría y fecha de creación del envío.
- Revisión de PDF, aprobación y publicación, o devolución con observaciones obligatorias. Ambas decisiones requieren confirmación en pantalla.
- Cada revisión comprueba el estado pendiente y la versión del proyecto bajo un bloqueo de fila. Un cambio o una revisión anterior devuelve conflicto, para evitar decidir sobre información desactualizada.
- Las categorías se pueden crear, editar, activar y desactivar; no se eliminan proyectos asociados.

## Acceso administrativo

El correo no otorga permisos automáticamente. La cuenta elegida por Davis es Leonidas@gmail.com, pero la comprobación no la encontró registrada. Primero debe crearse desde /crear-cuenta.

La asignación del rol está preparada en server/scripts/set-admin.ts. Después del registro y con la autorización correspondiente, ejecutar desde server:

```powershell
node --env-file-if-exists=.env --import tsx scripts/set-admin.ts Leonidas@gmail.com
```

El script comprueba que la base sea repositorio_proyectos y solo cambia el rol de la cuenta indicada. No crea cuentas, no cambia contraseñas y se detiene si no encuentra exactamente una coincidencia. Después, cerrar sesión e iniciar nuevamente para acceder al panel.

## Base de datos y archivos

Las tablas de server/database/001_initial.sql son suficientes; esta etapa no requiere una migración adicional.
Ver [guía de configuración](server/database/CONFIGURACION.md). Configura server/.env localmente; nunca compartas sus credenciales.

Los PDF se guardan en server/uploads con nombres aleatorios. PostgreSQL conserva sus metadatos. La carpeta no se publica como contenido estático; las descargas pasan por controles de propiedad, rol o estado aprobado. Se comprueban extensión, tipo declarado, tamaño y marcas básicas del PDF. No se interpreta completamente el archivo ni se analiza con antivirus.

El guardado de proyectos y metadatos utiliza transacciones; se intenta limpiar el archivo nuevo si la operación falla. Un cierre inesperado puede dejar archivos huérfanos. Antes de publicar se deben incorporar copias de seguridad de PostgreSQL y uploads, recuperación de archivos, HTTPS y almacenamiento persistente de sesiones.

Las sesiones actuales duran hasta 8 horas en memoria. Pendientes: verificación de correo y recuperación de contraseña. No se exige un dominio institucional hasta definir la institución.

## Validación

Desde la raíz:

```powershell
npm.cmd run build
npm.cmd test -- --watch=false
```

Desde server:

```powershell
npm.cmd run build
npm.cmd test
```

Resultado: 7 pruebas de Angular y 5 de API aprobadas. Cubren catálogo, área estudiantil, resumen administrativo, confirmación y observaciones, roles, propiedad, versión y transiciones de revisión. Usan HTTP y almacenamiento simulados y no alteran proyectos reales.

Davis ya verificó con PostgreSQL real el registro de un proyecto pendiente y la descarga del mismo PDF adjunto. La revisión administrativa y la publicación quedan pendientes de comprobar con la cuenta administradora.

Ambas aplicaciones compilan. Existe una advertencia informativa de tamaño de student.css (aproximadamente 6 KB frente al umbral de 4 KB). Las pruebas Angular usan test-temp y vitest.config.mjs para evitar los problemas anteriores del ejecutor en Windows.

## Próximas comprobaciones

1. Registrar y habilitar la cuenta administradora elegida.
2. Iniciar sesión como administrador y revisar el PDF de Informe 1.
3. Devolverlo con observaciones y comprobar la corrección y el reenvío desde la cuenta estudiante.
4. Aprobarlo y comprobar detalle público y descarga del PDF sin iniciar sesión.
5. Completar la comparación visual con Figma y la paginación del catálogo.

## Corrección de revisión administrativa (15/10/2026)

Se reprodujo el error PostgreSQL 42P08 al preparar el UPDATE de revisión: el parámetro de estado se infería con tipos incompatibles. REVIEW_SQL ahora indica varchar(20) explícitamente en ambos usos. Compila la API, pasan las cinco pruebas aisladas y pasa una prueba adicional que prepara la consulta real en PostgreSQL sin ejecutar UPDATE ni cambiar registros.

Prueba opcional desde server, con autorización para usar la configuración local:

```powershell
$env:RUN_POSTGRES_PREPARE='1'
node --env-file-if-exists=.env --import tsx --test test/review-postgres.test.ts
```

La prueba normal omite esta comprobación real cuando no se habilita expresamente. Tras la corrección, Davis debe volver a intentar la decisión desde la interfaz; no se cambió el estado del proyecto durante el diagnóstico.

## Categorías según el prototipo

La pantalla muestra directamente una tabla con nombre, descripción, cantidad real de proyectos asociados (todos los estados), etiqueta Activa/Inactiva y acciones Editar y Activar/Desactivar. Nueva categoría y Editar abren un diálogo modal. Los errores de guardado aparecen dentro del modal y conservan la información ingresada.

PATCH /api/admin/categories/:id/status cambia únicamente active y conserva nombre, descripción y proyectos asociados. Requiere sesión administradora. No se necesita migración ni se cambiaron datos reales durante la implementación.

Validación de esta etapa: compilación de Angular y API correcta; 9 pruebas de Angular y 5 pruebas de API pasan. La prueba opcional de preparación SQL real se omite en la ejecución aislada habitual.

## Catálogo público según el prototipo

/catalogo muestra una página independiente con título Explora el conocimiento, búsqueda por título/autor/resumen, filtros combinables de categoría y año, Limpiar filtros, contador y tarjetas en dos columnas (una en móvil). Las categorías y años se derivan de los proyectos aprobados recibidos, conservando también las categorías inactivas que tengan publicaciones. El inicio muestra los tres proyectos más recientes y conserva la portada y la invitación al registro. Los enlaces del menú, paneles y detalle público conducen a /catalogo.

La API mantiene su límite existente de 200 publicaciones; los filtros y el contador operan sobre esas publicaciones. La paginación sigue pendiente. No se modificó PostgreSQL.

Validación: compilación correcta y 10 pruebas Angular aprobadas, incluida búsqueda sin acentos, combinación de filtros y limpieza desde el botón del catálogo independiente.

## Retirar, restaurar y eliminar

Migración 002_project_lifecycle.sql aplicada con autorización. Añade withdrawn, withdrawal_reason, project_events y pending_file_deletions. No se modificaron estados ni se eliminaron proyectos o PDF reales durante la implementación.

En la tabla y el detalle administrativo, los publicados muestran Retirar y Eliminar; los retirados muestran Restaurar y Eliminar. Los proyectos pendientes u observados permiten Eliminar. Restaurar solo está permitido para withdrawn; Retirar solo para approved. Todas las acciones exigen motivo, versión vigente y sesión administradora. Eliminar exige además escribir el título exacto y confirmar en el diálogo; no existe restauración para un proyecto eliminado.

Retirar bloquea catálogo, detalle y descarga pública al cambiar el estado; conserva el PDF privado. Restaurar valida la existencia del PDF y vuelve a approved. El propietario ve el estado Retirado y su motivo, sin poder editarlo. El historial administrativo conserva actor, fecha, motivo, acción, estado previo, identificador y título, incluso si se elimina el proyecto; no conserva el contenido ni el PDF eliminado.

Eliminar registra la auditoría y una tarea persistente de limpieza en la misma transacción que borra el proyecto y sus metadatos. Después intenta borrar el PDF. Si Windows lo mantiene bloqueado, la interfaz informa de la limpieza pendiente y la API reintenta al iniciar y cada minuto. Las descargas quedan bloqueadas desde la eliminación del registro. No se elimina ningún archivo que siga asociado a otro documento.

Validación: compilan Angular y API; 12 pruebas Angular y 8 pruebas API aisladas aprobadas. Pasó además un recorrido con PostgreSQL real usando solo tablas TEMP y archivos simulados: retiro, exclusión pública, restauración, eliminación, auditoría persistente dentro de la sesión y limpieza de metadatos. Las tablas TEMP desaparecen al cerrar la conexión. No se borraron PDF reales para probar.

Para una instalación nueva, aplicar 001_initial.sql y luego 002_project_lifecycle.sql. La prueba PostgreSQL aislada se habilita desde server con RUN_LIFECYCLE_POSTGRES=1 y ejecutando node --env-file-if-exists=.env --import tsx --test test/lifecycle-postgres.test.ts, previa autorización para utilizar la configuración local.
