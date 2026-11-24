import type { Html } from "#jsx/jsx-runtime";
import type { FormErrors } from "../../web/_shared/form.ts";

type Props = {
  readonly errors: FormErrors | undefined;
  /** 項目名。""ならフォーム全体の文言。 */
  readonly name: string;
};

export function FieldErrors({ errors, name }: Props): Html | null {
  const messages = errors?.[name];
  if (messages == null) return null;
  return (
    <>
      {messages.map((message) => (
        <span className="form-error">{message}</span>
      ))}
    </>
  );
}
