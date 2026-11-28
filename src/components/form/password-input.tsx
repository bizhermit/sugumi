import { withAssets, type Html } from "#jsx/jsx-runtime";
import { asset } from "../../web/assets.ts";
import type { HtmlElements } from "../../web/_shared/html-attributes.ts";

type Props = Omit<HtmlElements["input"], "type">;

const ASSETS = {
  styles: [asset(import.meta.resolve("./_client/password-input.css"))],
  scripts: [asset(import.meta.resolve("./_client/password-input.ts"))],
};

export function PasswordInput(props: Props): Html {
  return withAssets(<input type="password" {...props} />, ASSETS);
}
