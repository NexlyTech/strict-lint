# @nexlytech.dev/strict-lint

Architecture linting for React: **where files live**, **how many components a file declares**, and
**which native HTML elements are allowed**.

One rule core, two runtimes. The rules are written against the ESLint plugin API, which
[oxlint implements identically](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html), so
the same package and the same `strictlint.config.json` drive both. Nothing is tied to a bundler, so
Vite, webpack, Next, Rspack, Turbopack and Metro are all equally supported.

Zero runtime dependencies.

## Install

```bash
bun add -d @nexlytech.dev/strict-lint   # or npm install -D / pnpm add -D / yarn add -D
```

Or skip this and let [`init`](#quick-start) install and configure it for you.

Works with oxlint `>=1.0` and ESLint `>=8.57`. On ESLint 8.57 flat config is opt-in, so run it with
`ESLINT_USE_FLAT_CONFIG=true`; ESLint 9 and 10 need no flag. Node `>=18`.

## Quick start

One command sets the whole thing up — installs the plugin, writes `strictlint.config.json`, and
wires up the linter your project already uses:

```bash
npx @nexlytech.dev/strict-lint init      # npm
pnpm dlx @nexlytech.dev/strict-lint init # pnpm
yarn dlx @nexlytech.dev/strict-lint init # yarn 2+  (yarn 1: use the npx form)
bunx @nexlytech.dev/strict-lint init     # bun
```

It reads your `package.json` to decide what to wire up. oxlint in your dependencies means
`.oxlintrc.json` is created or patched in place, preserving the rules already there. ESLint means
`eslint.config.mjs` is written, along with `@typescript-eslint/parser`, which that config needs.
Both means both, and neither scaffolds oxlint. Your package manager is detected from the runner
that invoked `init`, falling back to your lockfile.

An existing `eslint.config.*` is patched in place. The plugin loads inside oxlint's JS runtime, so
an AST rewriter was not an option; instead a dependency-free scanner finds the config array and
appends to it, keeping your comments and formatting. It handles the shapes that occur in practice:

```js
export default [ … ]                                 // plain flat config
export default defineConfig([ … ])                   // Next, shadcn
const config = defineConfig([ … ]); export default config
export default tseslint.config( … )                  // typescript-eslint
```

Your original is copied to `eslint.config.mjs.bak` first, the inserted lines are printed back as a
diff, and rerunning is a no-op once the plugin is referenced. Anything it cannot recognise with
certainty is left untouched and the block is printed for you to paste. Config files are written
before the install runs, so a network failure still leaves a valid setup and the command to finish
it.

| Flag | Effect |
| --- | --- |
| `--no-install` | Write the config files but skip the dependency install. |
| `--no-edit` | Print the ESLint block instead of patching an existing config. |
| `--dry-run` | Print every change, including the install, without performing any of it. |
| `--force` | Overwrite files that already exist. |
| `-h`, `--help` | Show usage, including the invocation for each package manager. |
| `-v`, `--version` | Print the version. |

Re-running `init` is safe: it skips files it has already written and reports why.

## Setup

Prefer to wire it by hand? Both linters take the same package.

### oxlint

```json
{
  "jsPlugins": ["@nexlytech.dev/strict-lint"],
  "rules": {
    "strict-lint/file-naming": "error",
    "strict-lint/folder-structure": "error",
    "strict-lint/import-boundaries": "error",
    "strict-lint/max-components-per-file": "error",
    "strict-lint/no-native-elements": "error"
  }
}
```

Alias the namespace with the object form if `strict-lint` collides:

```json
{ "jsPlugins": [{ "name": "arch", "specifier": "@nexlytech.dev/strict-lint" }] }
```

### ESLint (flat config)

```js
import tsParser from "@typescript-eslint/parser";
import strictLint from "@nexlytech.dev/strict-lint";

export default [
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "strict-lint": strictLint },
    rules: {
      "strict-lint/file-naming": "error",
      "strict-lint/folder-structure": "error",
      "strict-lint/import-boundaries": "error",
      "strict-lint/max-components-per-file": "error",
      "strict-lint/no-native-elements": "error",
    },
  },
];
```

Or take the preset, which registers the plugin and turns on every rule:

```js
import strictLint from "@nexlytech.dev/strict-lint";

export default [
  strictLint.configs.recommended, // or strictLint.configs.warn for incremental adoption
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
];
```

## Rules

| Rule | What it enforces | Config key |
| --- | --- | --- |
| [`file-naming`](#file-naming) | File names follow the casing convention set for their location. | `naming` |
| [`folder-structure`](#folder-structure) | Every file sits at a location the structure permits. | `structure` |
| [`import-boundaries`](#import-boundaries) | Dependencies flow one way, and features stay isolated. | `boundaries` |
| [`max-components-per-file`](#max-components-per-file) | A file declares at most N React components. | `components` |
| [`no-native-elements`](#no-native-elements) | Native tags the design system owns are replaced. | `elements` |

## Configuration

Rules read `strictlint.config.json` from the nearest ancestor directory of the file being linted.
`.strictlintrc.json`, `.strictlintrc`, and a `strictLint` key in `package.json` also work. Inline
rule options (ESLint's second argument) override the file.

Every list follows one convention: **`x` replaces the built-in default, `xExtra` appends to it.**
So you never have to restate the 100-odd allowed layout tags just to add one.

```json
{
  "root": "src",
  "featuresDir": "features",
  "ignoreExtra": ["**/*.codegen.ts"],

  "structure": {
    "allowExtra": ["widgets/**"],
    "denyExtra": [
      { "pattern": "**/helpers/**", "message": "Use `lib/`, not `helpers/`." }
    ]
  },

  "components": { "max": 1 },

  "naming": {
    "allowNamesExtra": ["route"],
    "rulesExtra": [
      { "files": ["providers/**"], "case": "PascalCase", "suffix": "Provider" }
    ]
  },

  "boundaries": {
    "crossFeature": "public",
    "aliases": { "@/": "", "~/": "" },
    "rulesExtra": [
      { "from": "shared", "disallow": ["route"], "message": "Shared code is route-agnostic." }
    ]
  },

  "elements": {
    "mode": "deny",
    "deny": { "label": false, "marquee": "literally anything else" },
    "allowExtra": ["dialog"],
    "allowInPaths": ["components/ui/**"]
  }
}
```

### `root`

The directory treated as the source root, matched **right-to-left** in the path, so
`apps/web/src/features/auth/X.tsx` resolves to `features/auth/X.tsx` in a monorepo. Files outside
the source root are never reported.

### `folder-structure`

Configured under `structure`. `allow` is a list of globs relative to `root`. `deny` is checked first so a wrong location can carry
a specific message instead of the generic one. Supported glob syntax: `*`, `**`, `?`, `{a,b}`.

The default preset is the feature-based structure:

```
src/
├── app/                      routes (Vue: routes/)
├── components/
│   └── ui/                   design-system primitives
├── features/
│   └── <feature>/
│       ├── components/
│       ├── hooks.ts          (Vue: composables.ts)
│       ├── types.ts
│       ├── services.ts
│       ├── queries.ts
│       └── store/
├── hooks/
├── lib/
├── providers/
├── services/
├── store/
└── types/
```

### `max-components-per-file`

Configured under `components`. `max` defaults to `1`; set `2` to allow a component plus one local sub-component.

A declaration counts as a component when its name is PascalCase, its initializer is callable, and
its body produces JSX. That deliberately excludes hooks, Zod schemas, `cva` variants,
`createContext` values, `styled` definitions, and PascalCase arrays that happen to hold JSX.
`forwardRef` and `memo` wrappers do count.

### `file-naming`

Configured under `naming`, as a list of `{ files, case, prefix?, suffix? }` rules. **The last matching rule wins**, so a narrow
rule placed after a broad one overrides it. Cases: `PascalCase`, `camelCase`, `kebab-case`,
`snake_case`, `SCREAMING_SNAKE_CASE`, `any`.

The default rules follow the extension, then carve out the exceptions:

| Location | Convention |
| --- | --- |
| `**/*.tsx`, `**/*.jsx` | `PascalCase` — they are components |
| `**/*.ts`, `**/*.js` | `camelCase` |
| `components/ui/**` | `kebab-case` — shadcn's own convention |
| `hooks/**`, `composables/**` | `camelCase`, prefixed `use` |
| `app/**`, `routes/**` | `any` — `__root.tsx` and `$postId.tsx` are framework syntax |
| source-root files | `any` — `router.tsx`, `main.tsx` |

The stem is everything before the first dot, so `Button.stories.tsx` is checked as `Button` and a
suggested rename keeps `.stories.tsx` intact. `allowNames` (default `["index"]`) accepts stems
verbatim under any rule.

### `import-boundaries`

Configured under `boundaries`. Two checks in one rule.

**Layers.** Every file falls into the first `layers` entry whose globs match it, and `rules` say
which layers a layer may not import from. The default graph is one-directional:

```
route    →  may import anything
feature  →  may import shared;  ✗ route
shared   →  may import shared;  ✗ feature, ✗ route
```

**Feature isolation.** `crossFeature` controls imports between two features:

| Value | Behavior |
| --- | --- |
| `"deny"` (default) | A feature may not import another feature at all. Shared code goes in the shared layer. |
| `"public"` | A feature may import another only through `features/<name>/index.ts`, never its internals. |
| `"allow"` | No check. |

Specifiers resolve through `aliases` (`@/` and `~/` by default, both mapping to the source root;
setting the key replaces the whole map)
and through relative paths, so `../../billing/services` is caught the same as
`@/features/billing/services`. Bare package specifiers and node builtins are never resolved.
`import`, `export … from`, `export *`, and dynamic `import()` are all checked. Set
`ignoreTypeImports: true` to exempt `import type`.

### `no-native-elements`

Configured under `elements`.

- `mode: "deny"` (default) bans only the tags listed in `deny`. Everything else is fine.
- `mode: "allow"` bans every intrinsic tag absent from `allow`. Use this to lock a design system down.

`deny` maps a tag to the replacement named in the message. Setting a tag to `false` removes an
inherited entry. `allowInPaths` defaults to `components/ui/**`, since primitives must wrap the
natives they replace.

Layout primitives (`div`, `span`, `section`, `header`, `footer`, `nav`, `ul`, `li`, `p`, headings,
SVG, media, …) are allowed by default because no design-system component replaces them.

## Escape hatches

```tsx
{/* shadcn-exempt: native submit needed for the no-JS fallback */}
<button type="submit" />
```

```tsx
// sfc-exempt-file: generated adapter, components are machine-emitted
```

```ts
// boundary-exempt: temporary shim while ARCH-412 lands
import { session } from "@/features/auth/store/session";
```

A line marker covers the line it sits on and the line below. A file marker must appear in the first
20 lines. Markers are configurable per rule via `exemptComments` / `exemptFileComments`, and
`strict-lint-exempt` / `strict-lint-exempt-file` work everywhere.

## Development

```bash
bun install
bun test        # 127 tests, ESLint RuleTester
bun run typecheck
bun run build
```
