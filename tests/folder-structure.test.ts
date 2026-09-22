import { folderStructure } from "../src/rules/folder-structure.js";
import { asEslintRule, ruleTester, virtual } from "./helpers.js";

const code = `export const value = 1;`;

ruleTester.run("folder-structure", asEslintRule(folderStructure), {
  valid: [
    { name: "route file", filename: virtual("app/dashboard/index.tsx"), code },
    { name: "shared component", filename: virtual("components/DataCard.tsx"), code },
    { name: "shadcn primitive", filename: virtual("components/ui/button.tsx"), code },
    { name: "feature component", filename: virtual("features/auth/components/LoginForm.tsx"), code },
    { name: "feature hooks slot", filename: virtual("features/auth/hooks.ts"), code },
    { name: "feature store", filename: virtual("features/auth/store/session.ts"), code },
    { name: "vue composables slot", filename: virtual("features/auth/composables.ts"), code },
    { name: "global lib", filename: virtual("lib/format.ts"), code },
    { name: "source root file", filename: virtual("router.tsx"), code },
    { name: "generated route tree is ignored", filename: virtual("routeTree.gen.ts"), code },
    { name: "file outside the source root is not our business", filename: "/__strict_lint_virtual__/scripts/build.ts", code },
  ],

  invalid: [
    {
      name: "unknown top-level folder",
      filename: virtual("widgets/Chart.tsx"),
      code,
      errors: [{ message: /`src\/widgets\/Chart\.tsx` does not match any allowed location\. Allowed top-level folders/ }],
    },
    {
      name: "loose file directly inside a feature",
      filename: virtual("features/auth/LoginForm.tsx"),
      code,
      errors: [{ message: /Allowed under `features\/`: `features\/\*\/components\/\*\*`/ }],
    },
    {
      name: "denied folder gets its own message",
      filename: virtual("views/Home.vue.ts"),
      code,
      errors: [{ message: /`views\/` is not part of this structure/ }],
    },
    {
      name: "hooks folder inside a feature is denied",
      filename: virtual("features/auth/hooks/useLogin.ts"),
      code,
      errors: [{ message: /A feature exposes hooks as a single `features\/<feature>\/hooks\.ts`, not a folder/ }],
    },
    {
      name: "structure is fully overridable",
      filename: virtual("app/page.tsx"),
      options: [{ structure: { allow: ["lib/**"] } }],
      code,
      errors: 1,
    },
  ],
});
