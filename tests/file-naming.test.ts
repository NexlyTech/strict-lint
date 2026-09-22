import { fileNaming } from "../src/rules/file-naming.js";
import { asEslintRule, ruleTester, virtual } from "./helpers.js";

const code = `export const value = 1;`;

ruleTester.run("file-naming", asEslintRule(fileNaming), {
  valid: [
    { name: "PascalCase component", filename: virtual("features/auth/components/LoginForm.tsx"), code },
    { name: "camelCase module", filename: virtual("features/auth/services.ts"), code },
    { name: "camelCase lib file", filename: virtual("lib/formatDate.ts"), code },
    { name: "kebab-case shadcn primitive", filename: virtual("components/ui/alert-dialog.tsx"), code },
    { name: "prefixed hook", filename: virtual("hooks/useMediaQuery.ts"), code },
    { name: "prefixed composable", filename: virtual("composables/useTheme.ts"), code },
    { name: "route files keep their framework syntax", filename: virtual("app/posts/$postId.tsx"), code },
    { name: "root layout route", filename: virtual("app/__root.tsx"), code },
    { name: "source-root files are unconstrained", filename: virtual("router.tsx"), code },
    { name: "index is always allowed", filename: virtual("features/auth/components/index.ts"), code },
    { name: "PascalCase provider", filename: virtual("providers/ThemeProvider.tsx"), code },
    { name: "generated files are globally ignored", filename: virtual("routeTree.gen.ts"), code },
    {
      name: "file exemption opts out",
      filename: virtual("lib/Format_Date.ts"),
      code: `// naming-exempt-file: mirrors an upstream vendor module name
export const value = 1;`,
    },
  ],

  invalid: [
    {
      name: "kebab-case component file",
      filename: virtual("features/auth/components/login-form.tsx"),
      code,
      errors: [{ message: /the file name must be PascalCase\. Rename it to `LoginForm\.tsx`/ }],
    },
    {
      name: "PascalCase module file",
      filename: virtual("features/auth/Services.ts"),
      code,
      errors: [{ message: /must be camelCase\. Rename it to `services\.ts`/ }],
    },
    {
      name: "PascalCase shadcn primitive",
      filename: virtual("components/ui/AlertDialog.tsx"),
      code,
      errors: [{ message: /must be kebab-case\. Rename it to `alert-dialog\.tsx`/ }],
    },
    {
      name: "hook missing its prefix",
      filename: virtual("hooks/mediaQuery.ts"),
      code,
      errors: [{ message: /must start with `use`\. Rename it to `useMediaQuery\.ts`/ }],
    },
    {
      name: "prefix and case reported together",
      filename: virtual("hooks/media-query.ts"),
      code,
      errors: [{ message: /must start with `use` and be camelCase\. Rename it to `useMediaQuery\.ts`/ }],
    },
    {
      name: "dotted extensions survive the suggestion",
      filename: virtual("features/auth/components/login-form.view.tsx"),
      code,
      errors: [{ message: /Rename it to `LoginForm\.view\.tsx`/ }],
    },
    {
      name: "a suffix requirement is configurable",
      filename: virtual("providers/Theme.tsx"),
      options: [{ naming: { rulesExtra: [{ files: ["providers/**"], case: "PascalCase", suffix: "Provider" }] } }],
      code,
      errors: [{ message: /must end with `Provider`\. Rename it to `ThemeProvider\.tsx`/ }],
    },
    {
      name: "rules are fully overridable and last match wins",
      filename: virtual("lib/formatDate.ts"),
      options: [{ naming: { rules: [{ files: ["**/*.ts"], case: "camelCase" }, { files: ["lib/**"], case: "kebab-case" }] } }],
      code,
      errors: [{ message: /must be kebab-case\. Rename it to `format-date\.ts`/ }],
    },
  ],
});
