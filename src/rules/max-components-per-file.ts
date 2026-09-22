import type { AstNode, RuleContext, RuleModule, Visitor } from "../types.js";
import { lineOf } from "../utils/ast.js";
import { findComponents } from "../utils/components.js";
import { hasFileExemption, hasLineExemption } from "../utils/exempt.js";
import { matchesAny } from "../utils/glob.js";
import { basename } from "../utils/path.js";
import { isGloballyIgnored, prepare } from "../utils/resolve.js";

export const maxComponentsPerFile: RuleModule<Record<string, unknown>> = {
  meta: {
    type: "problem",
    docs: {
      description: "Limit how many React components a single file may declare.",
      recommended: true,
      url: "https://github.com/NexlyTech/strict-lint#max-components-per-file",
    },
    schema: [{ type: "object", additionalProperties: true }],
  },

  create(context: RuleContext<Record<string, unknown>>): Visitor {
    const target = prepare(context);
    const { components } = target.config;

    if (isGloballyIgnored(target)) return {};
    if (target.rel !== null && matchesAny(target.rel, components.ignore)) return {};
    if (hasFileExemption(target.lines, components.exemptFileComments)) return {};

    const max = Math.max(1, components.max);
    const extension = target.rel ? (basename(target.rel).match(/\.[^.]+$/)?.[0] ?? ".tsx") : ".tsx";
    const escapeHatch = components.exemptComments[0] ?? "strict-lint-exempt";

    return {
      Program(node: AstNode) {
        const declared = findComponents(node);
        if (declared.length <= max) return;

        for (let index = max; index < declared.length; index += 1) {
          const component = declared[index];
          if (hasLineExemption(target.lines, lineOf(component.node, target.text), components.exemptComments)) continue;

          context.report({
            node: component.node,
            message:
              `\`${component.name}\` is component #${index + 1} in this file and the limit is ${max}. ` +
              `Move it to its own file (\`${component.name}${extension}\`), or add \`// ${escapeHatch}\` with a reason.`,
          });
        }
      },
    };
  },
};
