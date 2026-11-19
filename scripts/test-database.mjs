import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
const temp = path.resolve(".cache");
mkdirSync(temp, { recursive: true });
const result = spawnSync(
  process.execPath,
  ["scripts/go.mjs", "test", "-buildvcs=false", "-count=1", "-v", "./..."],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      MIGRATION_DB_TEST: "1",
      TMP: temp,
      TEMP: temp,
      TMPDIR: temp,
    },
  },
);
process.exit(result.status ?? 1);
