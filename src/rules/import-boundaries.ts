import type { AstNode, RuleContext, RuleModule, Visitor } from "../types.js";
import type { BoundariesConfig } from "../config/schema.js";
import { lineOf } from "../utils/ast.js";
import { hasFileExemption, hasLineExemption } from "../utils/exempt.js";
import { matchesAny } from "../utils/glob.js";
import { isFeatureEntry, resolveSpecifier } from "../utils/module.js";
import { featureOf } from "../utils/path.js";
import { isGloballyIgnored, prepare } from "../utils/resolve.js";

function layerOf(rel: string, boundaries: BoundariesConfig): string | null {
  for (const layer of boundaries.layers) {
    if (matchesAny(rel, layer.files)) return layer.name;
  }
  return null;
}

function sourceValue(node: AstNode): string | null {
  const source = node.source as AstNode | undefined;
  if (!source || typeof source !== "object") return null;
  return typeof source.value === "string" ? source.value : null;
}

export const importBoundaries: RuleModule<Record<string, unknown>> = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce the dependency direction between layers and isolation between features.",
      recommended: true,
      url: "https://github.com/nexlytech/strict-lint#import-boundaries",
    },
    schema: [{ type: "object", additionalProperties: true }],
  },

  create(context: RuleContext<Record<string, unknown>>): Visitor {
    const target = prepare(context);
    const { boundaries, featuresDir } = target.config;
    const rel = target.rel;

    if (rel === null) return {};
    if (isGloballyIgnored(target)) return {};
    if (matchesAny(rel, boundaries.ignore)) return {};
    if (hasFileExemption(target.lines, boundaries.exemptFileComments)) return {};

    const fromLayer = layerOf(rel, boundaries);
    const fromFeature = featureOf(rel, featuresDir);
    const applicable = boundaries.rules.filter((rule) => rule.from === fromLayer);

    if (applicable.length === 0 && (fromFeature === null || boundaries.crossFeature === "allow")) return {};

    const escapeHatch = boundaries.exemptComments[0] ?? "strict-lint-exempt";

    const check = (node: AstNode, isTypeOnly: boolean): void => {
      if (isTypeOnly && boundaries.ignoreTypeImports) return;

      const specifier = sourceValue(node);
      if (specifier === null) return;

      const to = resolveSpecifier(specifier, rel, boundaries.aliases);
      if (to === null || to === "") return;

      const toFeature = featureOf(to, featuresDir);
      let problem: string | null = null;

      if (fromFeature !== null && toFeature !== null && toFeature !== fromFeature) {
        if (boundaries.crossFeature === "deny") {
          problem =
            `feature \`${fromFeature}\` must not import from feature \`${toFeature}\`. ` +
            `Anything both features need belongs in the shared layer (\`components/\`, \`lib/\`, \`services/\`).`;
        } else if (boundaries.crossFeature === "public" && !isFeatureEntry(to, featuresDir)) {
          problem =
            `feature \`${fromFeature}\` may only reach feature \`${toFeature}\` through its entry ` +
            `\`${featuresDir}/${toFeature}/index.ts\`, not its internals.`;
        }
      }

      if (problem === null) {
        const toLayer = layerOf(to, boundaries);
        if (toLayer !== null && toLayer !== fromLayer) {
          const violated = applicable.find((rule) => rule.disallow.includes(toLayer));
          if (violated) {
            problem =
              violated.message ??
              `layer \`${fromLayer}\` must not import from layer \`${toLayer}\`.`;
          }
        }
      }

      if (problem === null) return;
      if (hasLineExemption(target.lines, lineOf(node, target.text), boundaries.exemptComments)) return;

      context.report({
        node,
        message: `\`${rel}\` imports \`${specifier}\` — ${problem} Add \`// ${escapeHatch}\` with a reason to override.`,
      });
    };

    return {
      ImportDeclaration(node) {
        check(node, node.importKind === "type");
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.exportKind === "type");
      },
      ExportAllDeclaration(node) {
        check(node, node.exportKind === "type");
      },
      ImportExpression(node) {
        check(node, false);
      },
    };
  },
};
