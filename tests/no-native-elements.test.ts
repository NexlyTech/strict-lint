import { noNativeElements } from "../src/rules/no-native-elements.js";
import { asEslintRule, ruleTester, virtual } from "./helpers.js";

ruleTester.run("no-native-elements", asEslintRule(noNativeElements), {
  valid: [
    {
      name: "layout primitives are allowed",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `export const LoginForm = () => <div><section><p>hi</p></section></div>;`,
    },
    {
      name: "design-system components pass through",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `import { Button } from "@/components/ui/button";
export const LoginForm = () => <Button>Save</Button>;`,
    },
    {
      name: "components/ui may wrap native elements",
      filename: virtual("components/ui/button.tsx"),
      code: `export const Button = (props) => <button {...props} />;`,
    },
    {
      name: "line exemption suppresses the report",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `export const LoginForm = () => (
  <div>
    {/* shadcn-exempt: native submit required for progressive enhancement */}
    <button type="submit" />
  </div>
);`,
    },
    {
      name: "file exemption suppresses the whole file",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `// shadcn-exempt-file: raw markup mirrors a third-party embed
export const LoginForm = () => <button />;`,
    },
    {
      name: "namespaced svg names are left alone",
      filename: virtual("features/auth/components/Icon.tsx"),
      code: `export const Icon = () => <svg><use xlinkHref="#x" /></svg>;`,
    },
    {
      name: "unlisted tag is fine in deny mode",
      filename: virtual("features/auth/components/Widget.tsx"),
      code: `export const Widget = () => <marquee />;`,
    },
  ],

  invalid: [
    {
      name: "native button is reported with its replacement",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      code: `export const LoginForm = () => <button type="submit">Save</button>;`,
      errors: [{ message: /`<button>` is not allowed here\. Use `Button` from `@\/components\/ui\/button`\./ }],
    },
    {
      name: "table family is reported per element",
      filename: virtual("features/billing/components/Invoices.tsx"),
      code: `export const Invoices = () => (
  <table>
    <tr>
      <td>1</td>
    </tr>
  </table>
);`,
      errors: 3,
    },
    {
      name: "allow mode bans anything outside the allow list",
      filename: virtual("features/auth/components/LoginForm.tsx"),
      options: [{ elements: { mode: "allow", allow: ["div"] } }],
      code: `export const LoginForm = () => <div><span /></div>;`,
      errors: [{ message: /`<span>` is not allowed here\. It is not in `elements.allow`\./ }],
    },
    {
      name: "allowInPaths is overridable",
      filename: virtual("components/ui/button.tsx"),
      options: [{ elements: { allowInPaths: [] } }],
      code: `export const Button = (props) => <button {...props} />;`,
      errors: 1,
    },
  ],
});
