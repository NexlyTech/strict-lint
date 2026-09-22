import { fileNaming } from "./rules/file-naming.js";
import { folderStructure } from "./rules/folder-structure.js";
import { importBoundaries } from "./rules/import-boundaries.js";
import { maxComponentsPerFile } from "./rules/max-components-per-file.js";
import { noNativeElements } from "./rules/no-native-elements.js";
import type { Plugin, RuleModule } from "./types.js";

export const PLUGIN_NAME = "strict-lint";
// Keep in sync with package.json — linters surface this in plugin metadata.
export const VERSION = "0.4.0";

export const rules = {
  "file-naming": fileNaming,
  "folder-structure": folderStructure,
  "import-boundaries": importBoundaries,
  "max-components-per-file": maxComponentsPerFile,
  "no-native-elements": noNativeElements,
} satisfies Record<string, RuleModule<Record<string, unknown>>>;

export type RuleName = keyof typeof rules;

const plugin = {
  meta: { name: PLUGIN_NAME, version: VERSION },
  rules,
} as unknown as Plugin;

const severities = (level: "error" | "warn") =>
  Object.fromEntries(Object.keys(rules).map((name) => [`${PLUGIN_NAME}/${name}`, level]));

plugin.configs = {
  /** ESLint flat config: everything on as an error. */
  recommended: {
    name: `${PLUGIN_NAME}/recommended`,
    plugins: { [PLUGIN_NAME]: plugin },
    rules: severities("error"),
  },
  /** ESLint flat config: everything on as a warning, for incremental adoption. */
  warn: {
    name: `${PLUGIN_NAME}/warn`,
    plugins: { [PLUGIN_NAME]: plugin },
    rules: severities("warn"),
  },
};

export default plugin;
export { plugin };
export { DEFAULT_CONFIG, DEFAULT_DENIED_ELEMENTS, LAYOUT_ELEMENTS } from "./config/defaults.js";
export { defineConfig } from "./config/schema.js";
export { loadConfig, mergeConfig, clearConfigCache } from "./config/load.js";
export type {
  StrictLintConfig,
  BoundariesConfig,
  NamingConfig,
  NamingRule,
  NamingCase,
  BoundaryRule,
  LayerDefinition,
  CrossFeaturePolicy,
  StrictLintUserConfig,
  StructureConfig,
  ComponentsConfig,
  ElementsConfig,
  ElementMode,
  DenyPattern,
} from "./config/schema.js";
