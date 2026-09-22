import { loadConfig } from "../config/load.js";
import type { StrictLintConfig } from "../config/schema.js";
import type { RuleContext } from "../types.js";
import { getFilename, getOptions, getText } from "./context.js";
import { matchesAny } from "./glob.js";
import { isVirtualFilename, srcRelative } from "./path.js";

export interface RuleTarget {
  config: StrictLintConfig;
  filename: string;
  /** Path relative to the source root, or null when the file sits outside it. */
  rel: string | null;
  text: string;
  lines: string[];
}

export function prepare(context: RuleContext<Record<string, unknown>>): RuleTarget {
  const filename = getFilename(context);
  const config = loadConfig(filename, getOptions(context));
  const text = getText(context);
  const rel = isVirtualFilename(filename) ? null : srcRelative(filename, config.root)?.rel ?? null;

  return { config, filename, rel, text, lines: text.split("\n") };
}

/** True when the file is excluded by the global ignore list. */
export function isGloballyIgnored(target: RuleTarget): boolean {
  return target.rel !== null && matchesAny(target.rel, target.config.ignore);
}
