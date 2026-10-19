import type { Account } from "../lib/auth/accounts.ts";
import { slot } from "../web/slot.ts";

/**
 * ログイン中のアカウント。before.tree.ts が、ログインを求めるルートでだけ設定する。
 * ログインなしで開けるルート（before.tree.ts の PUBLIC_ROUTES）では、ログイン中でも設定しない。
 */
export const loginAccount = slot<Account>("loginAccount");
