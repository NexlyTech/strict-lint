import { readFileSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute, resolve } from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import type {
  BoundaryRule, CrossFeaturePolicy, DenyPattern, LayerDefinition, NamingRule, StrictLintConfig,
} from "./schema.js";
import { isNamingCase } from "../utils/casing.js";
import { toPosix } from "../utils/path.js";

const CONFIG_FILENAMES = [
  "strictlint.config.json",
  ".strictlintrc.json",
  ".strictlintrc",
];

const PACKAGE_JSON_KEY = "strictLint";

type RawRecord = Record<string, unknown>;

const fileCache = new Map<string, RawRecord | null>();
const resolvedCache = new Map<string, StrictLintConfig>();

function readJson(path: string): RawRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RawRecord) : null;
  } catch {
    return null;
  }
}

/**
 * A config file the user explicitly wrote must never fail open — silently falling back to the
 * defaults would make the linter enforce something other than what the file says.
 */
function readConfigFile(path: string): RawRecord {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`strict-lint: cannot read ${path}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`strict-lint: ${path} is not valid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`strict-lint: ${path} must contain a JSON object.`);
  }
  return parsed as RawRecord;
}

/** Walks up from `startDir` until a config file, a package boundary, or the filesystem root. */
function discover(startDir: string): RawRecord | null {
  const cached = fileCache.get(startDir);
  if (cached !== undefined) return cached;

  let found: RawRecord | null = null;
  let dir = startDir;

  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        found = readConfigFile(candidate);
        break;
      }
    }
    if (found) break;

    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = readJson(pkgPath);
      const scoped = pkg?.[PACKAGE_JSON_KEY];
      if (scoped && typeof scoped === "object" && !Array.isArray(scoped)) {
        found = scoped as RawRecord;
        break;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  fileCache.set(startDir, found);
  return found;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asDenyPatterns(value: unknown): DenyPattern[] | null {
  if (!Array.isArray(value)) return null;
  const result: DenyPattern[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      result.push({ pattern: entry, message: `\`${entry}\` is a denied location.` });
    } else if (entry && typeof entry === "object" && typeof (entry as DenyPattern).pattern === "string") {
      const deny = entry as DenyPattern;
      result.push({ pattern: deny.pattern, message: deny.message ?? `\`${deny.pattern}\` is a denied location.` });
    }
  }
  return result;
}

function asLayers(value: unknown): LayerDefinition[] | null {
  if (!Array.isArray(value)) return null;
  const result: LayerDefinition[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const layer = entry as Partial<LayerDefinition>;
    const files = asStringArray(layer.files);
    if (typeof layer.name !== "string" || !files) continue;
    result.push({ name: layer.name, files });
  }
  return result;
}

function asBoundaryRules(value: unknown): BoundaryRule[] | null {
  if (!Array.isArray(value)) return null;
  const result: BoundaryRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const rule = entry as Partial<BoundaryRule>;
    const disallow = asStringArray(rule.disallow);
    if (typeof rule.from !== "string" || !disallow) continue;
    result.push(typeof rule.message === "string"
      ? { from: rule.from, disallow, message: rule.message }
      : { from: rule.from, disallow });
  }
  return result;
}

function asNamingRules(value: unknown): NamingRule[] | null {
  if (!Array.isArray(value)) return null;
  const result: NamingRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const rule = entry as Partial<NamingRule> & { files?: unknown };
    const files = typeof rule.files === "string" ? [rule.files] : asStringArray(rule.files);
    if (!files || files.length === 0 || !isNamingCase(rule.case)) continue;

    const parsed: NamingRule = { files, case: rule.case };
    if (typeof rule.prefix === "string") parsed.prefix = rule.prefix;
    if (typeof rule.suffix === "string") parsed.suffix = rule.suffix;
    result.push(parsed);
  }
  return result;
}

function asAliases(value: unknown, fallback: Record<string, string>): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const result: Record<string, string> = {};
  for (const [prefix, target] of Object.entries(value as RawRecord)) {
    if (typeof target === "string") result[prefix] = target;
  }
  return result;
}

/** `value` replaces `base` when present; `extra` is always appended. */
function mergeList<T>(base: T[], value: T[] | null, extra: T[] | null): T[] {
  const head = value ?? base;
  return extra ? [...head, ...extra] : head;
}

/** Shallow-merges a tag map. A `false` or `null` value removes the inherited entry. */
function mergeRecord(base: Record<string, string>, value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const result = { ...base };
  for (const [key, entry] of Object.entries(value as RawRecord)) {
    if (entry === false || entry === null) delete result[key];
    else if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

function isCrossFeaturePolicy(value: unknown): value is CrossFeaturePolicy {
  return value === "deny" || value === "public" || value === "allow";
}

function section(raw: RawRecord | null, key: string): RawRecord {
  const value = raw?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : {};
}

export function mergeConfig(...layers: (RawRecord | null | undefined)[]): StrictLintConfig {
  let config = DEFAULT_CONFIG;

  for (const raw of layers) {
    if (!raw) continue;
    const structure = section(raw, "structure");
    const components = section(raw, "components");
    const elements = section(raw, "elements");
    const boundaries = section(raw, "boundaries");
    const naming = section(raw, "naming");

    config = {
      root: typeof raw.root === "string" ? raw.root : config.root,
      featuresDir: typeof raw.featuresDir === "string" ? raw.featuresDir : config.featuresDir,
      ignore: mergeList(config.ignore, asStringArray(raw.ignore), asStringArray(raw.ignoreExtra)),
      structure: {
        allow: mergeList(config.structure.allow, asStringArray(structure.allow), asStringArray(structure.allowExtra)),
        deny: mergeList(config.structure.deny, asDenyPatterns(structure.deny), asDenyPatterns(structure.denyExtra)),
        ignore: mergeList(config.structure.ignore, asStringArray(structure.ignore), asStringArray(structure.ignoreExtra)),
      },
      components: {
        max: typeof components.max === "number" ? components.max : config.components.max,
        ignore: mergeList(config.components.ignore, asStringArray(components.ignore), asStringArray(components.ignoreExtra)),
        exemptComments: mergeList(config.components.exemptComments, asStringArray(components.exemptComments), asStringArray(components.exemptCommentsExtra)),
        exemptFileComments: mergeList(config.components.exemptFileComments, asStringArray(components.exemptFileComments), asStringArray(components.exemptFileCommentsExtra)),
      },
      elements: {
        mode: elements.mode === "allow" || elements.mode === "deny" ? elements.mode : config.elements.mode,
        deny: mergeRecord(config.elements.deny, elements.deny),
        allow: mergeList(config.elements.allow, asStringArray(elements.allow), asStringArray(elements.allowExtra)),
        allowInPaths: mergeList(config.elements.allowInPaths, asStringArray(elements.allowInPaths), asStringArray(elements.allowInPathsExtra)),
        exemptComments: mergeList(config.elements.exemptComments, asStringArray(elements.exemptComments), asStringArray(elements.exemptCommentsExtra)),
        exemptFileComments: mergeList(config.elements.exemptFileComments, asStringArray(elements.exemptFileComments), asStringArray(elements.exemptFileCommentsExtra)),
      },
      boundaries: {
        aliases: asAliases(boundaries.aliases, config.boundaries.aliases),
        layers: mergeList(config.boundaries.layers, asLayers(boundaries.layers), asLayers(boundaries.layersExtra)),
        rules: mergeList(config.boundaries.rules, asBoundaryRules(boundaries.rules), asBoundaryRules(boundaries.rulesExtra)),
        crossFeature: isCrossFeaturePolicy(boundaries.crossFeature) ? boundaries.crossFeature : config.boundaries.crossFeature,
        ignoreTypeImports: typeof boundaries.ignoreTypeImports === "boolean" ? boundaries.ignoreTypeImports : config.boundaries.ignoreTypeImports,
        ignore: mergeList(config.boundaries.ignore, asStringArray(boundaries.ignore), asStringArray(boundaries.ignoreExtra)),
        exemptComments: mergeList(config.boundaries.exemptComments, asStringArray(boundaries.exemptComments), asStringArray(boundaries.exemptCommentsExtra)),
        exemptFileComments: mergeList(config.boundaries.exemptFileComments, asStringArray(boundaries.exemptFileComments), asStringArray(boundaries.exemptFileCommentsExtra)),
      },
      naming: {
        rules: mergeList(config.naming.rules, asNamingRules(naming.rules), asNamingRules(naming.rulesExtra)),
        allowNames: mergeList(config.naming.allowNames, asStringArray(naming.allowNames), asStringArray(naming.allowNamesExtra)),
        ignore: mergeList(config.naming.ignore, asStringArray(naming.ignore), asStringArray(naming.ignoreExtra)),
        exemptComments: mergeList(config.naming.exemptComments, asStringArray(naming.exemptComments), asStringArray(naming.exemptCommentsExtra)),
        exemptFileComments: mergeList(config.naming.exemptFileComments, asStringArray(naming.exemptFileComments), asStringArray(naming.exemptFileCommentsExtra)),
      },
    };
  }

  return config;
}

/**
 * Resolves the effective config for one file. The discovered config file is the base;
 * options passed inline by the linter override it.
 */
export function loadConfig(filename: string, inline?: RawRecord): StrictLintConfig {
  const startDir = isAbsolute(filename) ? dirname(filename) : dirname(resolve(filename));
  const cacheKey = `${toPosix(startDir)}\u0000${inline ? JSON.stringify(inline) : ""}`;

  let resolved = resolvedCache.get(cacheKey);
  if (!resolved) {
    resolved = mergeConfig(discover(startDir), inline);
    resolvedCache.set(cacheKey, resolved);
  }
  return resolved;
}

/** Test seam — the caches are process-lifetime by design. */
export function clearConfigCache(): void {
  fileCache.clear();
  resolvedCache.clear();
}
