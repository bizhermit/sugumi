import { s } from "../../../lib/schema/index.ts";

export const username = s.string({ required: true, maxLength: 64, label: "ユーザー" });
export const displayName = s.string({ required: true, label: "表示名" });
export const password = s.string({ required: true, maxLength: 128, trim: false, label: "パスワード" });
// 最小文字数は設定時だけ掛ける。ログインや現在のパスワードの照合にまで掛けると、方針を厳しくしたときに既存のパスワードが通らなくなる。
export const newPassword = s.string({ ...password.options, minLength: 8, label: "新しいパスワード" });
