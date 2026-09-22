import type { NamingCase } from "../utils/casing.js";

export type ElementMode = "deny" | "allow";

export interface NamingRule {
  /** Globs relative to `root`. The LAST matching rule wins, so narrow rules go after broad ones. */
  files: string[];
  case: NamingCase;
  /** Required leading text on the file stem, e.g. `use` for hooks. */
  prefix?: string;
  /** Required trailing text on the file stem, e.g. `Provider`. */
  suffix?: string;
}

export interface NamingConfig {
  rules: NamingRule[];
  /** File stems accepted verbatim under any rule. */
  allowNames: string[];
  /** Globs, relative to `root`, exempt from this rule. */
  ignore: string[];
  exemptComments: string[];
  exemptFileComments: string[];
}

export interface DenyPattern {
  pattern: string;
  message: string;
}

export interface StructureConfig {
  /** Globs, relative to `root`, describing every legal file location. */
  allow: string[];
  /** Explicit rejections evaluated before `allow`, so they can carry a better message. */
  deny: DenyPattern[];
  /** Globs skipped by this rule only. */
  ignore: string[];
}

export interface ComponentsConfig {
  /** How many React components one file may declare. */
  max: number;
  /** Globs, relative to `root`, exempt from the limit. */
  ignore: string[];
  exemptComments: string[];
  exemptFileComments: string[];
}

export interface ElementsConfig {
  /**
   * `deny` bans only the tags listed in `deny`.
   * `allow` bans every intrinsic tag absent from `allow`.
   */
  mode: ElementMode;
  /** Tag -> replacement hint. Used for messages in both modes. */
  deny: Record<string, string>;
  /** Tags that are always permitted. */
  allow: string[];
  /** Globs, relative to `root`, where intrinsic tags are unrestricted. */
  allowInPaths: string[];
  exemptComments: string[];
  exemptFileComments: string[];
}

export type { NamingCase };

export type CrossFeaturePolicy = "deny" | "public" | "allow";

export interface LayerDefinition {
  name: string;
  /** Globs relative to `root`. A file belongs to the first layer that matches it. */
  files: string[];
}

export interface BoundaryRule {
  /** Layer name the importing file belongs to. */
  from: string;
  /** Layer names that file may not import from. */
  disallow: string[];
  /** Replaces the generated message when present. */
  message?: string;
}

export interface BoundariesConfig {
  /** Module-specifier prefix -> path relative to `root`. */
  aliases: Record<string, string>;
  layers: LayerDefinition[];
  rules: BoundaryRule[];
  /**
   * `deny` forbids any import between two features.
   * `public` permits them only through `features/<name>/index.ts`.
   * `allow` disables the check.
   */
  crossFeature: CrossFeaturePolicy;
  /** When true, `import type` is exempt from every boundary check. */
  ignoreTypeImports: boolean;
  /** Globs, relative to `root`, exempt from this rule. */
  ignore: string[];
  exemptComments: string[];
  exemptFileComments: string[];
}

export interface StrictLintConfig {
  /** Directory name treated as the source root, matched right-to-left in the path. */
  root: string;
  /** Directory under `root` that holds features. */
  featuresDir: string;
  /** Globs, relative to `root`, skipped by every rule. */
  ignore: string[];
  structure: StructureConfig;
  components: ComponentsConfig;
  elements: ElementsConfig;
  boundaries: BoundariesConfig;
  naming: NamingConfig;
}

/**
 * User-facing config. Every list follows the same convention:
 * `x` replaces the built-in default, `xExtra` appends to whatever `x` resolves to.
 */
export interface StrictLintUserConfig {
  root?: string;
  featuresDir?: string;
  ignore?: string[];
  ignoreExtra?: string[];
  structure?: {
    allow?: string[];
    allowExtra?: string[];
    deny?: (DenyPattern | string)[];
    denyExtra?: (DenyPattern | string)[];
    ignore?: string[];
    ignoreExtra?: string[];
  };
  components?: {
    max?: number;
    ignore?: string[];
    ignoreExtra?: string[];
    exemptComments?: string[];
    exemptCommentsExtra?: string[];
    exemptFileComments?: string[];
    exemptFileCommentsExtra?: string[];
  };
  naming?: {
    rules?: NamingRule[];
    rulesExtra?: NamingRule[];
    allowNames?: string[];
    allowNamesExtra?: string[];
    ignore?: string[];
    ignoreExtra?: string[];
    exemptComments?: string[];
    exemptCommentsExtra?: string[];
    exemptFileComments?: string[];
    exemptFileCommentsExtra?: string[];
  };
  boundaries?: {
    aliases?: Record<string, string>;
    layers?: LayerDefinition[];
    layersExtra?: LayerDefinition[];
    rules?: BoundaryRule[];
    rulesExtra?: BoundaryRule[];
    crossFeature?: CrossFeaturePolicy;
    ignoreTypeImports?: boolean;
    ignore?: string[];
    ignoreExtra?: string[];
    exemptComments?: string[];
    exemptCommentsExtra?: string[];
    exemptFileComments?: string[];
    exemptFileCommentsExtra?: string[];
  };
  elements?: {
    mode?: ElementMode;
    /** Tag -> replacement hint. Merged with the default map; `false` removes an inherited tag. */
    deny?: Record<string, string | false>;
    allow?: string[];
    allowExtra?: string[];
    allowInPaths?: string[];
    allowInPathsExtra?: string[];
    exemptComments?: string[];
    exemptCommentsExtra?: string[];
    exemptFileComments?: string[];
    exemptFileCommentsExtra?: string[];
  };
}

/** Identity helper that gives editors type-checking on a JS/TS config file. */
export function defineConfig(config: StrictLintUserConfig): StrictLintUserConfig {
  return config;
}
