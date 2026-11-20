import { withAssets, type Html } from "#jsx/jsx-runtime";
import { asset } from "../../web/assets.ts";
import type { HtmlElements } from "../../web/html-attributes.ts";

type Props = Omit<HtmlElements["input"], "type">;

const ASSETS = {
  styles: [asset(import.meta.resolve("./_assets/password-input.css"))],
  scripts: [asset(import.meta.resolve("./_assets/password-input.ts"))],
};

/** パスワードの入力欄。JSが有効なら表示切り替えのボタンが付く。 */
export function PasswordInput(props: Props): Html {
  return withAssets(<input type="password" {...props} />, ASSETS);
}
