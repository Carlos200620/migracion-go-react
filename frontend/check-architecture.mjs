import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "src");
const levels = { atoms: 0, molecules: 1, organisms: 2, templates: 3 };
const errors = [];
let files = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "tests") walk(file);
      continue;
    }
    if (!/\.(js|jsx)$/.test(file)) continue;
    files++;
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const layer = /^components\/(atoms|molecules|organisms|templates)\//.exec(
      relative,
    )?.[1];
    if (!layer) continue;
    const ast = parse(fs.readFileSync(file, "utf8"), {
      sourceType: "module",
      plugins: ["jsx"],
    });
    for (const node of ast.program.body) {
      if (!node.source?.value?.startsWith(".")) continue;
      const target = path
        .relative(root, path.resolve(path.dirname(file), node.source.value))
        .replaceAll("\\", "/");
      const targetLayer =
        /^components\/(atoms|molecules|organisms|templates)\//.exec(
          target,
        )?.[1];
      if (targetLayer && levels[targetLayer] > levels[layer])
        errors.push(`${relative} depende de una capa superior: ${target}`);
      if (/^(pages|services|context|hooks|routes)\//.test(target))
        errors.push(
          `${relative} mezcla presentación con aplicación: ${target}`,
        );
      if (target.startsWith(".."))
        errors.push(`${relative} importa fuera del frontend/src`);
    }
  }
}
walk(root);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Atomic Design: dependencias de ${files} módulos verificadas. Componentes visuales sin dependencias de páginas, servicios ni sesión.`,
  );
