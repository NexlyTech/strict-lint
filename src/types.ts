export interface AstNode {
  type: string;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
  range?: [number, number];
  start?: number;
  end?: number;
  [key: string]: unknown;
}

export interface ReportDescriptor {
  node?: AstNode;
  loc?: AstNode["loc"];
  message: string;
}

export interface RuleContext<Options = unknown> {
  id?: string;
  filename?: string;
  physicalFilename?: string;
  options?: Options[];
  settings?: Record<string, unknown>;
  sourceCode?: { text: string };
  report(descriptor: ReportDescriptor): void;
  getFilename?(): string;
  getPhysicalFilename?(): string;
  getSourceCode?(): { text: string };
}

export type Visitor = Record<string, (node: AstNode) => void>;

export interface RuleModule<Options = unknown> {
  meta: {
    type: "problem" | "suggestion" | "layout";
    docs: { description: string; recommended?: boolean; url?: string };
    schema: unknown[];
    messages?: Record<string, string>;
  };
  create(context: RuleContext<Options>): Visitor;
}

export interface Plugin {
  meta: { name: string; version: string };
  rules: Record<string, RuleModule<never>>;
  configs?: Record<string, unknown>;
}
