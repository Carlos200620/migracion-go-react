import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function checkPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `El puerto ${port} está ocupado. Cierra el servidor anterior antes de iniciar esta copia.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
try {
  await checkPort(Number(process.env.PORT || 3000));
  await checkPort(4200);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
mkdirSync(path.join(root, ".cache"), { recursive: true });
const binary = path.join(
  root,
  ".cache",
  process.platform === "win32" ? "repositorio-api.exe" : "repositorio-api",
);
const build = spawnSync(
  process.execPath,
  ["scripts/go.mjs", "build", "-buildvcs=false", "-o", binary, "."],
  { cwd: root, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const children = [
  spawn(binary, [], {
    cwd: path.join(root, "backend"),
    stdio: "inherit",
    env: process.env,
  }),
  spawn(
    process.execPath,
    [
      path.join(root, "frontend/node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
    ],
    { cwd: path.join(root, "frontend"), stdio: "inherit", env: process.env },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
