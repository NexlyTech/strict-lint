import type { AstNode, RuleContext, RuleModule, Visitor } from "../types.js";
import { globPrefix, matches, matchesAny } from "../utils/glob.js";
import { isGloballyIgnored, prepare } from "../utils/resolve.js";

function allowedRoots(patterns: readonly string[]): string[] {
  const roots = new Set<string>();
  for (const pattern of patterns) {
    const prefix = globPrefix(pattern);
    if (prefix !== null && pattern.includes("/")) roots.add(prefix);
  }
  return [...roots].sort();
}

function patternsUnder(patterns: readonly string[], segment: string): string[] {
  return patterns.filter((pattern) => globPrefix(pattern) === segment);
}

export const folderStructure: RuleModule<Record<string, unknown>> = {
  meta: {
    type: "problem",
    docs: {
      description: "Require every source file to sit at a location the configured structure allows.",
      recommended: true,
      url: "https://github.com/nexlytech/strict-lint#folder-structure",
    },
    schema: [{ type: "object", additionalProperties: true }],
  },

  create(context: RuleContext<Record<string, unknown>>): Visitor {
    const target = prepare(context);
    const { structure, root } = target.config;
    const { rel } = target;

    if (rel === null) return {};
    if (isGloballyIgnored(target)) return {};
    if (matchesAny(rel, structure.ignore)) return {};

    return {
      Program(node: AstNode) {
        for (const denied of structure.deny) {
          if (matches(rel, denied.pattern)) {
            context.report({ node, message: `\`${root}/${rel}\` — ${denied.message}` });
            return;
          }
        }

        if (matchesAny(rel, structure.allow)) return;

        const segment = rel.includes("/") ? rel.split("/")[0] : null;
        const siblings = segment ? patternsUnder(structure.allow, segment) : [];

        const advice = siblings.length
          ? `Allowed under \`${segment}/\`: ${siblings.map((pattern) => `\`${pattern}\``).join(", ")}.`
          : `Allowed top-level folders under \`${root}/\`: ${allowedRoots(structure.allow).map((name) => `\`${name}/\``).join(", ")}.`;

        context.report({
          node,
          message: `\`${root}/${rel}\` does not match any allowed location. ${advice} Adjust \`structure.allow\` in \`strictlint.config.json\` if this location is intended.`,
        });
      },
    };
  },
};
