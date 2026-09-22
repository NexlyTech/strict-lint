import type { AstNode, RuleContext, RuleModule, Visitor } from "../types.js";
import { isIntrinsicTag, jsxTagName, lineOf } from "../utils/ast.js";
import { hasFileExemption, hasLineExemption } from "../utils/exempt.js";
import { matchesAny } from "../utils/glob.js";
import { isGloballyIgnored, prepare } from "../utils/resolve.js";

export const noNativeElements: RuleModule<Record<string, unknown>> = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow native HTML elements that the design system owns.",
      recommended: true,
      url: "https://github.com/nexlytech/strict-lint#no-native-elements",
    },
    schema: [{ type: "object", additionalProperties: true }],
  },

  create(context: RuleContext<Record<string, unknown>>): Visitor {
    const target = prepare(context);
    const { elements } = target.config;

    if (isGloballyIgnored(target)) return {};
    if (target.rel !== null && matchesAny(target.rel, elements.allowInPaths)) return {};
    if (hasFileExemption(target.lines, elements.exemptFileComments)) return {};

    const allowed = new Set(elements.allow);
    const escapeHatch = elements.exemptComments[0] ?? "strict-lint-exempt";

    return {
      JSXOpeningElement(node: AstNode) {
        const tag = jsxTagName(node.name);
        if (!tag || !isIntrinsicTag(tag)) return;

        const replacement = elements.deny[tag];
        const banned = elements.mode === "allow" ? !allowed.has(tag) : replacement !== undefined;
        if (!banned) return;

        if (hasLineExemption(target.lines, lineOf(node, target.text), elements.exemptComments)) return;

        const advice = replacement
          ? `Use ${replacement}.`
          : `It is not in \`elements.allow\`. Use the design-system component instead.`;

        context.report({
          node,
          message: `\`<${tag}>\` is not allowed here. ${advice} If the native element is genuinely required, add \`// ${escapeHatch}\` with a reason.`,
        });
      },
    };
  },
};
