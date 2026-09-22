import { describe, expect, test } from "bun:test";
import { patchFlatConfig, type FlatConfigPatch } from "../src/eslint-patch.js";

const PATCH: FlatConfigPatch = {
  imports: 'import strictLint from "@nexlytech.dev/strict-lint";\nimport tsParser from "@typescript-eslint/parser";',
  entries: `strictLint.configs.recommended,
{
  files: ["**/*.{ts,tsx,js,jsx}"],
  languageOptions: { parser: tsParser },
}`,
  marker: "@nexlytech.dev/strict-lint",
};

function patch(source: string): string {
  const result = patchFlatConfig(source, PATCH);
  if (result.status !== "patched") throw new Error(`expected a patch, got ${result.status}`);
  return result.source;
}

describe("flat config shapes", () => {
  test("a bare array export", () => {
    const out = patch(`import js from "@eslint/js";\n\nexport default [\n  js.configs.recommended,\n];\n`);
    expect(out).toContain('import strictLint from "@nexlytech.dev/strict-lint";');
    expect(out).toContain("  js.configs.recommended,\n  strictLint.configs.recommended,");
    expect(out.trimEnd().endsWith("];")).toBe(true);
  });

  test("defineConfig wrapping an array", () => {
    const out = patch(`import { defineConfig } from "eslint/config";\n\nexport default defineConfig([\n  base,\n]);\n`);
    expect(out).toContain("  base,\n  strictLint.configs.recommended,");
    expect(out.trimEnd().endsWith("]);")).toBe(true);
  });

  test("a variable declaration exported by name", () => {
    const source = `import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([".next/**"]),
]);

export default eslintConfig;
`;
    const out = patch(source);
    expect(out).toContain('globalIgnores([".next/**"]),\n  strictLint.configs.recommended,');
    expect(out).toContain("export default eslintConfig;");
    expect(out).toContain('import nextVitals from "eslint-config-next/core-web-vitals";');
  });

  test("a variadic tseslint.config call", () => {
    const out = patch(`import tseslint from "typescript-eslint";\n\nexport default tseslint.config(base, other);\n`);
    expect(out).toContain("strictLint.configs.recommended,");
    expect(out.trimEnd().endsWith(");")).toBe(true);
  });

  test("an empty array still gets a valid entry", () => {
    const out = patch(`export default [];\n`);
    expect(out).toContain("strictLint.configs.recommended,");
    expect(out).not.toContain("[,");
  });
});

describe("safety", () => {
  test("a config already referencing the plugin is left alone", () => {
    const source = `import strictLint from "@nexlytech.dev/strict-lint";\nexport default [strictLint.configs.recommended];\n`;
    expect(patchFlatConfig(source, PATCH).status).toBe("present");
  });

  test("an unrecognised export is reported, never guessed at", () => {
    const result = patchFlatConfig(`export default makeConfig;\n`, PATCH);
    expect(result.status).toBe("unsupported");
  });

  test("a file with no default export is reported", () => {
    const result = patchFlatConfig(`export const config = [];\n`, PATCH);
    expect(result).toEqual({ status: "unsupported", reason: "no `export default` found" });
  });

  test("brackets inside strings and comments do not derail the scan", () => {
    const source = `import js from "@eslint/js";

export default [
  // a stray ] and ( in a comment
  { files: ["**/*.[jt]s"], name: "has ] bracket" },
];
`;
    const out = patch(source);
    expect(out).toContain('name: "has ] bracket" },\n  strictLint.configs.recommended,');
  });

  test("multi-line import lists are not split", () => {
    const source = `import {
  defineConfig,
  globalIgnores,
} from "eslint/config";

export default defineConfig([]);
`;
    const out = patch(source);
    expect(out).toContain('} from "eslint/config";\nimport strictLint');
  });

  test("a config with no imports at all still gets them", () => {
    const out = patch(`export default [];\n`);
    expect(out.startsWith('import strictLint from "@nexlytech.dev/strict-lint";')).toBe(true);
  });
});
