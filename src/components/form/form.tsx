import { withAssets, type Html } from "#jsx/jsx-runtime";
import { asset } from "../../web/assets.ts";
import { CSRF_FIELD_NAME, csrfSlot } from "../../web/csrf.ts";
import type { HtmlElements } from "../../web/html-attributes.ts";

type Props = HtmlElements["form"] & {
  readonly req: Request;
};

const ASSETS = {
  styles: [asset(import.meta.resolve("./_assets/form.css"))],
  scripts: [asset(import.meta.resolve("./_assets/form.ts"))],
};

export function Form({ req, className, children, ...props }: Props): Html {
  return withAssets(
    <form {...props} className={["form", className]}>
      {props.method === "post" && <input type="hidden" name={CSRF_FIELD_NAME} value={csrfSlot.get(req)} />}
      {children}
    </form>,
    ASSETS,
  );
}
