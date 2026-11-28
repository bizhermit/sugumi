import { $string } from "../../../lib/_shared/schema/primitives.ts";

export const username = $string({ required: true, maxLength: 64, label: "auth.username" });
export const displayName = $string({ required: true, label: "auth.displayName" });
export const password = $string({ required: true, maxLength: 128, trim: false, label: "auth.password" });
export const newPassword = $string({ ...password.options, minLength: 8, label: "auth.newPassword" });
