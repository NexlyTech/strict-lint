import type { RuleContext } from "../types.js";

export function getFilename(context: RuleContext<unknown>): string {
  return (
    context.filename ??
    context.physicalFilename ??
    context.getFilename?.() ??
    context.getPhysicalFilename?.() ??
    "<input>"
  );
}

export function getText(context: RuleContext<unknown>): string {
  return context.sourceCode?.text ?? context.getSourceCode?.().text ?? "";
}

export function getOptions<T>(context: RuleContext<T>): Partial<T> {
  const first = context.options?.[0];
  return first && typeof first === "object" ? (first as Partial<T>) : {};
}
