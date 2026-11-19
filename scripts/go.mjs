import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local =
  process.env.GO_EXECUTABLE ||
  path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Go",
    "go",
    "bin",
    "go.exe",
  );
const temp = path.join(root, ".cache/tmp");
mkdirSync(temp, { recursive: true });
const env = {
  ...process.env,
  TEMP: temp,
  TMP: temp,
  TMPDIR: temp,
  GOCACHE: path.join(root, ".cache/go-build"),
  GOMODCACHE: path.join(root, ".cache/go-mod"),
  GOPATH: path.join(root, ".cache/go-path"),
};
for (const key of ["GOCACHE", "GOMODCACHE", "GOPATH"])
  mkdirSync(env[key], { recursive: true });
const result = spawnSync(
  existsSync(local) ? local : "go",
  process.argv.slice(2),
  { cwd: path.join(root, "backend"), env, stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
