import type { AstNode, RuleContext, RuleModule, Visitor } from "../types.js";
import type { NamingRule } from "../config/schema.js";
import { extensionOf, matchesCase, stemOf, toCase } from "../utils/casing.js";
import { hasFileExemption } from "../utils/exempt.js";
import { matchesAny } from "../utils/glob.js";
import { basename } from "../utils/path.js";
import { isGloballyIgnored, prepare } from "../utils/resolve.js";

/** The last matching rule wins, so a narrow rule placed after a broad one overrides it. */
function ruleFor(rel: string, rules: readonly NamingRule[]): NamingRule | null {
  let winner: NamingRule | null = null;
  for (const rule of rules) {
    if (matchesAny(rel, rule.files)) winner = rule;
  }
  return winner;
}

export const fileNaming: RuleModule<Record<string, unknown>> = {
  meta: {
    type: "problem",
    docs: {
      description: "Require file names to follow the casing convention configured for their location.",
      recommended: true,
      url: "https://github.com/NexlyTech/strict-lint#file-naming",
    },
    schema: [{ type: "object", additionalProperties: true }],
  },

  create(context: RuleContext<Record<string, unknown>>): Visitor {
    const target = prepare(context);
    const { naming } = target.config;
    const rel = target.rel;

    if (rel === null) return {};
    if (isGloballyIgnored(target)) return {};
    if (matchesAny(rel, naming.ignore)) return {};
    if (hasFileExemption(target.lines, naming.exemptFileComments)) return {};

    const filename = basename(rel);
    const stem = stemOf(filename);
    if (stem === "" || naming.allowNames.includes(stem)) return {};

    const rule = ruleFor(rel, naming.rules);
    if (rule === null) return {};

    const escapeHatch = naming.exemptFileComments[0] ?? "strict-lint-exempt-file";
    const extension = extensionOf(filename);

    return {
      Program(node: AstNode) {
        const problems: string[] = [];
        let suggestion = stem;

        if (rule.prefix && !stem.startsWith(rule.prefix)) {
          problems.push(`start with \`${rule.prefix}\``);
          suggestion = rule.prefix + suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
        }
        if (rule.suffix && !stem.endsWith(rule.suffix)) {
          problems.push(`end with \`${rule.suffix}\``);
          suggestion += rule.suffix;
        }
        if (!matchesCase(stem, rule.case)) {
          problems.push(`be ${rule.case}`);
        }

        if (problems.length === 0) return;

        context.report({
          node,
          message:
            `\`${rel}\` — the file name must ${problems.join(" and ")}. ` +
            `Rename it to \`${toCase(suggestion, rule.case)}${extension}\`, ` +
            `or add \`// ${escapeHatch}\` with a reason.`,
        });
      },
    };
  },
};
