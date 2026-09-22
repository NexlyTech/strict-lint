import type { AstNode } from "../types.js";
import { containsJsx, isPascalCase } from "./ast.js";

export interface ComponentDeclaration {
  name: string;
  node: AstNode;
}

const FUNCTION_INITS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "CallExpression",
  "ClassExpression",
]);

const TRANSPARENT = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSInstantiationExpression",
  "ParenthesizedExpression",
]);

function unwrap(node: unknown): AstNode | null {
  let current = node as AstNode | null;
  while (current && typeof current === "object" && TRANSPARENT.has(current.type)) {
    current = current.expression as AstNode | null;
  }
  return current && typeof current.type === "string" ? current : null;
}

function identifierName(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as AstNode;
  return candidate.type === "Identifier" && typeof candidate.name === "string" ? candidate.name : null;
}

function collect(statement: AstNode, out: ComponentDeclaration[]): void {
  switch (statement.type) {
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration": {
      const inner = statement.declaration as AstNode | undefined;
      if (inner && typeof inner.type === "string") collect(inner, out);
      return;
    }

    case "FunctionDeclaration":
    case "ClassDeclaration": {
      const name = identifierName(statement.id);
      if (name !== null && !isPascalCase(name)) return;
      if (!containsJsx(statement)) return;
      out.push({ name: name ?? "default export", node: statement });
      return;
    }

    case "VariableDeclaration": {
      const declarators = (statement.declarations as AstNode[] | undefined) ?? [];
      for (const declarator of declarators) {
        const name = identifierName(declarator.id);
        if (name === null || !isPascalCase(name)) continue;

        const init = unwrap(declarator.init);
        if (!init || !FUNCTION_INITS.has(init.type)) continue;
        if (!containsJsx(init)) continue;

        out.push({ name, node: declarator });
      }
      return;
    }

    default:
  }
}

/**
 * Components declared at the top level of a module. A declaration counts when its name is
 * PascalCase, its initializer is callable, and its body produces JSX — which naturally excludes
 * hooks, Zod schemas, `cva` variants, contexts, and styled definitions.
 */
export function findComponents(program: AstNode): ComponentDeclaration[] {
  const body = (program.body as AstNode[] | undefined) ?? [];
  const found: ComponentDeclaration[] = [];
  for (const statement of body) {
    if (statement && typeof statement.type === "string") collect(statement, found);
  }
  return found;
}
