import { jaFormMessages, s, type MessageDictionary } from "../../../lib/schema/index.ts";
import { newPassword, password } from "../../auth/_shared/account.ts";

export const passwordChangeSchema = s.object(
  {
    currentPassword: s.string({ ...password.options, label: "現在のパスワード" }),
    newPassword,
    confirmPassword: s.string({ ...password.options, label: "新しいパスワード（確認）" }),
  },
  {
    refine: (value) =>
      value.newPassword !== value.confirmPassword && {
        code: "mismatch",
        key: "password.mismatch",
        path: ["confirmPassword"],
      },
  },
);

export const passwordChangeMessages: MessageDictionary = {
  ...jaFormMessages,
  "password.mismatch": () => "新しいパスワードと一致しません",
};
