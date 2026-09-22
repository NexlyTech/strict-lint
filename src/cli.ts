#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { PLUGIN_NAME, VERSION, rules } from "./index.js";

const PACKAGE_NAME = "@nexlytech.dev/strict-lint";
const PARSER_NAME = "@typescript-eslint/parser";
const CONFIG_FILE = "strictlint.config.json";
const OXLINT_FILE = ".oxlintrc.json";
const ESLINT_FILE = "eslint.config.mjs";
const ESLINT_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
];

const KNOWN_FLAGS = new Set(["-h", "--help", "-v", "--version", "--force", "--dry-run", "--no-install"]);

type PackageManager = "bun" | "pnpm" | "yarn" | "npm";
type Target = "oxlint" | "eslint";

const ADD: Record<PackageManager, string[]> = {
  bun: ["add", "-d"],
  pnpm: ["add", "-D"],
  yarn: ["add", "-D"],
  npm: ["install", "-D"],
};

const EXEC: Record<PackageManager, string> = {
  bun: `bunx ${PACKAGE_NAME} init`,
  pnpm: `pnpm dlx ${PACKAGE_NAME} init`,
  yarn: `yarn dlx ${PACKAGE_NAME} init`,
  npm: `npx ${PACKAGE_NAME} init`,
};

const RUNNER: Record<PackageManager, string> = { bun: "bunx", pnpm: "pnpm exec", yarn: "yarn", npm: "npx" };

const LOCKFILES: [string, PackageManager][] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/** The runner's own user agent is authoritative; a lockfile is the fallback. */
function detectPackageManager(cwd: string): PackageManager {
  const agent = process.env.npm_config_user_agent ?? "";
  for (const name of ["bun", "pnpm", "yarn", "npm"] as const) {
    if (agent.startsWith(`${name}/`)) return name;
  }
  for (const [file, manager] of LOCKFILES) {
    if (existsSync(join(cwd, file))) return manager;
  }
  return "npm";
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function dependencyNames(cwd: string): Set<string> {
  const pkg = readJson(join(cwd, "package.json"));
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const section = pkg?.[field];
    if (section && typeof section === "object") {
      for (const name of Object.keys(section)) names.add(name);
    }
  }
  return names;
}

function detectSourceRoot(cwd: string): string {
  for (const candidate of ["src", "app", "source"]) {
    if (existsSync(join(cwd, candidate))) return candidate;
  }
  return "src";
}

/** Declared dependencies decide what to wire up; a stray config file is the fallback signal. */
function detectTargets(cwd: string, dependencies: Set<string>, eslintConfig: string | undefined): Target[] {
  const targets: Target[] = [];
  if (dependencies.has("oxlint") || existsSync(join(cwd, OXLINT_FILE))) targets.push("oxlint");
  if (dependencies.has("eslint") || eslintConfig !== undefined) targets.push("eslint");
  return targets.length > 0 ? targets : ["oxlint"];
}

function seedConfig(root: string): string {
  return `${JSON.stringify(
    {
      root,
      structure: { allowExtra: [] },
      components: { max: 1 },
      naming: { allowNamesExtra: [] },
      boundaries: { crossFeature: "deny" },
      elements: { mode: "deny", allowExtra: [], allowInPaths: ["components/ui/**"] },
    },
    null,
    2,
  )}\n`;
}

function ruleEntries(): Record<string, string> {
  return Object.fromEntries(Object.keys(rules).map((name) => [`${PLUGIN_NAME}/${name}`, "error"]));
}

function eslintConfigSource(): string {
  return `import strictLint from "${PACKAGE_NAME}";
import tsParser from "${PARSER_NAME}";

export default [
  strictLint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
];
`;
}

function installCommand(manager: PackageManager, packages: string[]): string {
  return [manager, ...ADD[manager], ...packages].join(" ");
}

function help(manager: PackageManager): string {
  return `${PACKAGE_NAME} v${VERSION}

Usage
  ${EXEC[manager]}

Commands
  init            Write ${CONFIG_FILE}, wire up the linters this project uses, and
                  install the plugin with the package manager it detects.

Options
  --no-install    Write the config files but skip the dependency install.
  --force         Overwrite files that already exist.
  --dry-run       Print what would change without writing or installing anything.
  -h, --help      Show this message.
  -v, --version   Print the version.

Runs the same under every package manager
  npx ${PACKAGE_NAME} init
  pnpm dlx ${PACKAGE_NAME} init
  yarn dlx ${PACKAGE_NAME} init
  bunx ${PACKAGE_NAME} init`;
}

interface Plan {
  path: string;
  contents: string;
  action: "create" | "update" | "skip";
  note?: string;
}

function planOxlint(cwd: string, force: boolean): Plan {
  const path = join(cwd, OXLINT_FILE);
  const entries = ruleEntries();

  if (!existsSync(path)) {
    const contents = `${JSON.stringify({ jsPlugins: [PACKAGE_NAME], rules: entries }, null, 2)}\n`;
    return { path, contents, action: "create" };
  }

  const existing = readJson(path);
  if (!existing) {
    return { path, contents: "", action: "skip", note: `${OXLINT_FILE} is not valid JSON; left untouched.` };
  }

  const plugins = Array.isArray(existing.jsPlugins) ? [...existing.jsPlugins] : [];
  const alreadyRegistered = plugins.some(
    (entry) =>
      entry === PACKAGE_NAME ||
      (entry && typeof entry === "object" && (entry as { specifier?: string }).specifier === PACKAGE_NAME),
  );
  if (!alreadyRegistered) plugins.push(PACKAGE_NAME);

  const existingRules = (existing.rules ?? {}) as Record<string, unknown>;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existing)) {
    if (key !== "jsPlugins" && key !== "rules") rest[key] = value;
  }
  const merged = { jsPlugins: plugins, ...rest, rules: { ...entries, ...existingRules } };

  if (alreadyRegistered && Object.keys(entries).every((name) => name in existingRules) && !force) {
    return { path, contents: "", action: "skip", note: `${OXLINT_FILE} already references the plugin.` };
  }

  return {
    path,
    contents: `${JSON.stringify(merged, null, 2)}\n`,
    action: "update",
    note: "existing rules were preserved; the file was reformatted with 2-space indentation",
  };
}

/** Merging someone's flat config is guesswork, so an existing one is only ever printed for them. */
function planEslint(cwd: string, existing: string | undefined, force: boolean): Plan {
  if (existing !== undefined && !force) {
    return {
      path: join(cwd, existing),
      contents: "",
      action: "skip",
      note: `${existing} already exists; add the block printed below, or pass --force to replace it.`,
    };
  }
  const name = existing ?? ESLINT_FILE;
  return {
    path: join(cwd, name),
    contents: eslintConfigSource(),
    action: existing === undefined ? "create" : "update",
  };
}

function install(cwd: string, manager: PackageManager, packages: string[]): boolean {
  const result = spawnSync(manager, [...ADD[manager], ...packages], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function run(argv: string[]): number {
  const cwd = process.cwd();
  const manager = detectPackageManager(cwd);
  const flags = new Set(argv.filter((arg) => arg.startsWith("-")));
  const command = argv.find((arg) => !arg.startsWith("-"));

  if (flags.has("-h") || flags.has("--help") || command === "help") {
    process.stdout.write(`${help(manager)}\n`);
    return 0;
  }
  if (flags.has("-v") || flags.has("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const unknown = [...flags].filter((flag) => !KNOWN_FLAGS.has(flag));
  if (unknown.length > 0) {
    process.stderr.write(`Unknown option${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}.\n\n${help(manager)}\n`);
    return 1;
  }
  if (command !== "init") {
    process.stderr.write(`${command ? `Unknown command \`${command}\`.` : "No command given."}\n\n${help(manager)}\n`);
    return 1;
  }

  if (!existsSync(join(cwd, "package.json"))) {
    process.stderr.write(`No package.json in ${cwd}. Run this from your project root.\n`);
    return 1;
  }

  const force = flags.has("--force");
  const dryRun = flags.has("--dry-run");
  const skipInstall = flags.has("--no-install");
  const dependencies = dependencyNames(cwd);
  const eslintConfig = ESLINT_FILES.find((name) => existsSync(join(cwd, name)));
  const targets = detectTargets(cwd, dependencies, eslintConfig);
  const root = detectSourceRoot(cwd);
  const plans: Plan[] = [];

  const configPath = join(cwd, CONFIG_FILE);
  plans.push(
    existsSync(configPath) && !force
      ? {
          path: configPath,
          contents: "",
          action: "skip",
          note: `${CONFIG_FILE} already exists; pass --force to replace it.`,
        }
      : { path: configPath, contents: seedConfig(root), action: existsSync(configPath) ? "update" : "create" },
  );

  if (targets.includes("oxlint")) plans.push(planOxlint(cwd, force));
  if (targets.includes("eslint")) plans.push(planEslint(cwd, eslintConfig, force));

  for (const plan of plans) {
    const label = relative(cwd, plan.path) || plan.path;
    const suffix = plan.note ? ` (${plan.note})` : "";
    if (plan.action === "skip") {
      process.stdout.write(`  skip    ${label}${suffix}\n`);
      continue;
    }
    if (!dryRun) writeFileSync(plan.path, plan.contents, "utf8");
    process.stdout.write(`  ${plan.action}  ${label}${suffix}\n`);
  }

  const eslintUntouched = targets.includes("eslint") && eslintConfig !== undefined && !force;
  if (eslintUntouched) {
    process.stdout.write(`\nAdd this to ${eslintConfig}:\n\n${eslintConfigSource().trimEnd().replace(/^/gm, "  ")}\n`);
  }

  const packages = [
    ...(dependencies.has(PACKAGE_NAME) ? [] : [PACKAGE_NAME]),
    ...(targets.includes("eslint") && !dependencies.has(PARSER_NAME) ? [PARSER_NAME] : []),
  ];

  let installed = true;
  if (packages.length > 0) {
    if (dryRun) {
      process.stdout.write(`\n  would run  ${installCommand(manager, packages)}\n`);
    } else if (skipInstall) {
      process.stdout.write(`\nInstall the dependencies\n  ${installCommand(manager, packages)}\n`);
    } else {
      process.stdout.write(`\n  install ${installCommand(manager, packages)}\n\n`);
      installed = install(cwd, manager, packages);
    }
  }

  if (!installed) {
    process.stderr.write(
      `\nThe install failed. Config files are written; finish with:\n  ${installCommand(manager, packages)}\n`,
    );
    return 1;
  }

  if (dryRun) {
    process.stdout.write("\nDry run: nothing was written or installed.\n");
    return 0;
  }

  process.stdout.write("\nNext steps\n");
  if (targets.includes("oxlint")) process.stdout.write(`  Lint with oxlint:  ${RUNNER[manager]} oxlint\n`);
  if (targets.includes("eslint")) process.stdout.write(`  Lint with ESLint:  ${RUNNER[manager]} eslint .\n`);
  process.stdout.write(`  Tune the rules in ${CONFIG_FILE}\n`);

  return 0;
}

process.exit(run(process.argv.slice(2)));
