import type { Html } from "#jsx/jsx-runtime";
import { formatIssue } from "../../lib/_shared/schema/message.ts";
import type { Issue } from "../../lib/_shared/schema/types.ts";
import type { HtmlElements } from "../../web/_shared/html-attributes.ts";
import { i18nSlot } from "../../web/i18n.ts";

type Props = {
  readonly req: Request;
  readonly issues: readonly Issue[] | undefined;
  readonly name?: string;
} & HtmlElements["div"];

export function FormMessages({ req, issues, name = "", className, ...props }: Props): Html | null {
  const msgs = issues?.filter((issue) => issue.path.join(".") === name);
  const { $t } = i18nSlot.get(req);
  return (
    <div {...props} className={["_form-messages", className]} data-name={name}>
      {msgs?.map((issue) => (
        <span className="_form-message" data-type={issue.type}>
          {formatIssue(issue, $t)}
        </span>
      ))}
    </div>
  );
}
