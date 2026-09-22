import { appendFileSync, existsSync } from "node:fs";

// Legacy `.eslintrc` setups do `require("@nexlytech/strict-lint")` and expect the plugin object
// itself, not `{ default: plugin }`. Rolldown cannot emit both shapes, so flatten after the build.
const target = new URL("../dist/index.cjs", import.meta.url);

if (!existsSync(target)) {
  console.error("cjs-interop: dist/index.cjs is missing — run tsdown first.");
  process.exit(1);
}

// A fresh object rather than `exports.default` itself: assigning onto the plugin would graft the
// module's other named exports, and a circular `default`, onto the object ESLint receives.
appendFileSync(target, "\nmodule.exports = Object.assign({}, exports.default, exports);\n");
