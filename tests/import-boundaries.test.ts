import { importBoundaries } from "../src/rules/import-boundaries.js";
import { asEslintRule, ruleTester, virtual } from "./helpers.js";

ruleTester.run("import-boundaries", asEslintRule(importBoundaries), {
  valid: [
    {
      name: "a route may import a feature",
      filename: virtual("app/dashboard.tsx"),
      code: `import { Billing } from "@/features/billing";`,
    },
    {
      name: "a feature may import shared code",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";`,
    },
    {
      name: "a feature may import its own internals relatively",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `import { login } from "../services";
import type { Credentials } from "../types";`,
    },
    {
      name: "shared code may import shared code",
      filename: virtual("lib/format.ts"),
      code: `import { API_URL } from "@/lib/constants";
import type { User } from "@/types/user";`,
    },
    {
      name: "external packages are never resolved",
      filename: virtual("lib/format.ts"),
      code: `import { useQuery } from "@tanstack/react-query";
import react from "react";
import fs from "node:fs";`,
    },
    {
      name: "crossFeature allow disables the feature check",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      options: [{ boundaries: { crossFeature: "allow" } }],
      code: `import { plan } from "@/features/billing/services";`,
    },
    {
      name: "crossFeature public permits the feature entry",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      options: [{ boundaries: { crossFeature: "public" } }],
      code: `import { Billing } from "@/features/billing";
import { Plans } from "@/features/billing/index";`,
    },
    {
      name: "ignoreTypeImports exempts type-only imports",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      options: [{ boundaries: { ignoreTypeImports: true } }],
      code: `import type { Plan } from "@/features/billing/types";`,
    },
    {
      name: "a line exemption overrides the boundary",
      filename: virtual("lib/format.ts"),
      code: `// strict-lint-exempt: temporary shim, tracked in ARCH-412
import { session } from "@/features/auth/store/session";`,
    },
  ],

  invalid: [
    {
      name: "shared code must not import a feature",
      filename: virtual("lib/format.ts"),
      code: `import { login } from "@/features/auth/services";`,
      errors: [{ message: /Shared code must not depend on a feature or a route/ }],
    },
    {
      name: "shared code must not import a route",
      filename: virtual("components/DataCard.tsx"),
      code: `import { Route } from "@/app/dashboard";`,
      errors: 1,
    },
    {
      name: "a feature must not import a route",
      filename: virtual("features/auth/hooks.ts"),
      code: `import { Route } from "@/app/dashboard";`,
      errors: [{ message: /layer `feature` must not import from layer `route`/ }],
    },
    {
      name: "one feature must not import another",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `import { plan } from "@/features/billing/services";`,
      errors: [{ message: /feature `auth` must not import from feature `billing`\. Anything both features need belongs in the shared layer/ }],
    },
    {
      name: "relative paths that climb into another feature are caught",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `import { plan } from "../../billing/services";`,
      errors: [{ message: /feature `auth` must not import from feature `billing`/ }],
    },
    {
      name: "crossFeature public rejects reaching into internals",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      options: [{ boundaries: { crossFeature: "public" } }],
      code: `import { plan } from "@/features/billing/services";`,
      errors: [{ message: /may only reach feature `billing` through its entry `features\/billing\/index\.ts`/ }],
    },
    {
      name: "re-exports cross boundaries too",
      filename: virtual("lib/index.ts"),
      code: `export { login } from "@/features/auth/services";
export * from "@/features/billing";`,
      errors: 2,
    },
    {
      name: "dynamic imports are checked",
      filename: virtual("lib/lazy.ts"),
      code: `export const load = () => import("@/features/auth/components/LoginForm");`,
      errors: 1,
    },
    {
      name: "type-only imports count unless opted out",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `import type { Plan } from "@/features/billing/types";`,
      errors: 1,
    },
    {
      name: "the tilde alias resolves like the at alias",
      filename: virtual("lib/format.ts"),
      code: `import { login } from "~/features/auth/services";`,
      errors: 1,
    },
    {
      name: "layers are fully overridable",
      filename: virtual("lib/format.ts"),
      options: [{
        boundaries: {
          layers: [{ name: "core", files: ["lib/**"] }, { name: "ui", files: ["components/**"] }],
          rules: [{ from: "core", disallow: ["ui"], message: "Core must stay presentation-free." }],
        },
      }],
      code: `import { Button } from "@/components/ui/button";`,
      errors: [{ message: /Core must stay presentation-free\./ }],
    },
  ],
});
