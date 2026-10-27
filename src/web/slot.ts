import type { RouteContext } from "./router.ts";

export type Slot<T> = {
  set: (ctx: RouteContext, value: T) => void;
  /** set していなければ例外を投げる。set する before を必ず通るルートで使う。 */
  get: (ctx: RouteContext) => T;
  /** set していなければ undefined を返す。 */
  find: (ctx: RouteContext) => T | undefined;
};

/**
 * before.tree.ts・before.ts で用意した値を、あとで実行する before やメソッドのファイルに渡す入れ物を作る。
 * 値はリクエストの ctx ごとに持つので、ほかのリクエストからは見えず、リクエストが終われば消える。
 * モジュールの直下で 1 回だけ呼び、set する before と同じディレクトリのファイルから export する。
 *
 *   // src/routes/admin/account.ts
 *   export const adminAccount = slot<Account>("adminAccount");
 *   // src/routes/admin/before.tree.ts
 *   adminAccount.set(ctx, account);
 *   // src/routes/admin/users/get.ts
 *   const account = adminAccount.get(ctx);
 *
 * name は、get が投げる例外のメッセージに使う。
 */
export function slot<T>(name: string): Slot<T> {
  const values = new WeakMap<RouteContext, T>();
  return {
    set: (ctx, value) => {
      values.set(ctx, value);
    },
    get: (ctx) => {
      // undefined を set した場合と区別するので、値ではなく has で判定する。
      if (!values.has(ctx)) throw new Error(`slot "${name}" に値が設定されていません`);
      return values.get(ctx) as T;
    },
    find: (ctx) => values.get(ctx),
  };
}
