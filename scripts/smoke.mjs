import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const root = process.cwd(),
  backendPort = 3102,
  webPort = 4202;
const children = [];
const hash = (data) => createHash("sha256").update(data).digest("hex");
try {
  children.push(
    spawn(path.join(root, ".cache/repositorio-api.exe"), [], {
      cwd: path.join(root, "backend"),
      env: {
        ...process.env,
        PORT: String(backendPort),
        APP_ORIGIN: `http://localhost:${webPort}`,
        DISABLE_FILE_CLEANUP: "1",
      },
      stdio: "inherit",
    }),
  );
  children.push(
    spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      {
        cwd: path.join(root, "frontend"),
        env: { ...process.env, API_TARGET: `http://127.0.0.1:${backendPort}` },
        stdio: "inherit",
      },
    ),
  );
  const base = `http://127.0.0.1:${webPort}`;
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(base + "/api/health", {
        signal: AbortSignal.timeout(2000),
      });
      const data = await r.json();
      if (data.service === "repositorio-api-go") {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (!ready)
    throw Error("No se pudo comprobar el proxy React/Go en este entorno.");
  const health = await fetch(base + "/api/health/database").then((r) =>
    r.json(),
  );
  if (health.database !== "connected")
    throw Error("PostgreSQL no está conectado.");
  for (const route of [
    "/",
    "/catalogo",
    "/iniciar-sesion",
    "/mis-proyectos",
    "/administracion/categorias",
    "/recuperar-contrasena",
    "/notificaciones",
  ]) {
    const r = await fetch(base + route);
    if (!r.ok || !(await r.text()).includes("/src/main.jsx"))
      throw Error("Ruta no disponible: " + route);
  }
  const result = await fetch(base + "/api/projects").then((r) => r.json());
  const projects = result.items;
  let pdfs = 0;
  for (const p of projects) {
    if (!p.hasDocument) continue;
    const r = await fetch(base + `/api/projects/${p.id}/document?inline=1`);
    if (!r.ok) throw Error("PDF publicado no disponible.");
    const data = Buffer.from(await r.arrayBuffer());
    const matched = fs
      .readdirSync(path.join(root, "backend/uploads"))
      .some(
        (key) =>
          hash(fs.readFileSync(path.join(root, "backend/uploads", key))) ===
          hash(data),
      );
    if (!matched)
      throw Error("El PDF descargado difiere de los archivos copiados.");
    pdfs++;
  }
  const recovery = await fetch(base + "/api/auth/recovery-status").then((r) =>
    r.json(),
  );
  console.log("Recuperación SMTP configurada: " + recovery.enabled);
  console.log(
    JSON.stringify({
      proxy: "React → Go",
      database: "connected",
      routes: 7,
      publicProjects: result.total,
      pdfsVerified: pdfs,
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill();
}
