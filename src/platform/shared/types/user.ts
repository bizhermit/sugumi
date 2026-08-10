/**
 * 利用者識別子の正本（規約 §2.1 のツリー図 / §3.3 が `sugumi/platform/shared/types/user.js` を名指し）。
 * 識別子の取り違え防止のためのブランド型（a）であり、構造的ブランドでよい（§11.4）。
 * セキュリティ境界のブランド型（b: Html / SafeRedirect / Secret）とは目的が異なる。
 */
export type UserId = string & { readonly __brand: "UserId" };
