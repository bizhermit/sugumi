import { withAssets, type Html } from "#jsx/jsx-runtime";
import { asset } from "../../web/assets.ts";
import type { HtmlElements } from "../../web/html-attributes.ts";

type Props = HtmlElements["form"];

const ASSETS = {
  styles: [asset(import.meta.resolve("./_assets/form.css"))],
  scripts: [asset(import.meta.resolve("./_assets/form.ts"))],
};

export function Form({ className, ...props }: Props): Html {
  return withAssets(<form {...props} className={["form", className]} />, ASSETS);
}
