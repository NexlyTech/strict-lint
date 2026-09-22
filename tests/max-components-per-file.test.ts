import { maxComponentsPerFile } from "../src/rules/max-components-per-file.js";
import { asEslintRule, ruleTester, virtual } from "./helpers.js";

const componentFile = virtual("features/auth/components/LoginForm.tsx");

ruleTester.run("max-components-per-file", asEslintRule(maxComponentsPerFile), {
  valid: [
    {
      name: "one component",
      filename: componentFile,
      code: `export const LoginForm = () => <div />;`,
    },
    {
      name: "component plus hook, types, schema, context and variants",
      filename: componentFile,
      code: `import { z } from "zod";
import { cva } from "class-variance-authority";
import { createContext } from "react";

export interface LoginFormProps { email: string }
export const loginSchema = z.object({ email: z.string() });
export const FormContext = createContext<string | null>(null);
export const formVariants = cva("flex", { variants: {} });
export function useLoginForm() { return null; }

export const LoginForm = () => <div />;`,
    },
    {
      name: "PascalCase array holding JSX is not a component",
      filename: componentFile,
      code: `export const Columns = [{ cell: () => <span /> }];
export const LoginForm = () => <div />;`,
    },
    {
      name: "max of two is configurable",
      filename: componentFile,
      options: [{ components: { max: 2 } }],
      code: `const LoginFormCard = () => <div />;
export const LoginForm = () => <LoginFormCard />;`,
    },
    {
      name: "file exemption opts the file out",
      filename: componentFile,
      code: `// sfc-exempt-file: generated adapter shim
const A = () => <div />;
const B = () => <div />;`,
    },
    {
      name: "test files are globally ignored",
      filename: virtual("features/auth/components/LoginForm.test.tsx"),
      code: `const A = () => <div />;
const B = () => <div />;`,
    },
  ],

  invalid: [
    {
      name: "second component is reported",
      filename: componentFile,
      code: `const LoginFormCard = () => <div />;
export const LoginForm = () => <LoginFormCard />;`,
      errors: [{ message: /`LoginForm` is component #2 in this file and the limit is 1\. Move it to its own file \(`LoginForm\.tsx`\)/ }],
    },
    {
      name: "counts function declarations and forwardRef wrappers",
      filename: componentFile,
      code: `import { forwardRef, memo } from "react";
export function Header() { return <header />; }
export const Body = forwardRef((props, ref) => <div ref={ref} />);
export const Footer = memo(() => <footer />);`,
      errors: 2,
    },
    {
      name: "third component still reported when max is two",
      filename: componentFile,
      options: [{ components: { max: 2 } }],
      code: `const A = () => <div />;
const B = () => <div />;
const C = () => <div />;`,
      errors: [{ message: /`C` is component #3 in this file and the limit is 2/ }],
    },
    {
      name: "line exemption only excuses the marked component",
      filename: componentFile,
      code: `const A = () => <div />;
// sfc-exempt: tiny local presentational helper
const B = () => <div />;
const C = () => <div />;`,
      errors: [{ message: /`C` is component #3/ }],
    },
  ],
});
