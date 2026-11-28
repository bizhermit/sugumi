import { $object } from "../../../lib/_shared/schema/object.ts";
import { $string } from "../../../lib/_shared/schema/primitives.ts";
import { newPassword, password } from "../../auth/_shared/account.ts";

export const passwordChangeSchema = $object(
  {
    currentPassword: $string({ ...password.options, label: "user.password.current" }),
    newPassword,
    confirmPassword: $string({ ...password.options, label: "user.password.confirm" }),
  },
  {
    refine: (value) =>
      value.newPassword !== value.confirmPassword && {
        code: "mismatch",
        key: "user.password.mismatch",
        path: ["confirmPassword"],
      },
  },
);
