/**
 * 環境変数から読み込むアプリの設定。
 * Deno.env を参照するのはこのファイルだけにする。
 * 変数を追加したら deno.json の permissions.default.env にも追記すること。
 */
export const PORT = Number(Deno.env.get("PORT") ?? 3000);
