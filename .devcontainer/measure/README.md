# フェーズ1 実測環境（T1-8 成果物）

**このディレクトリは実測用の使い捨て資材であり、納品物ではない。**
`src/` / `public/` / `db/` / `docs/` / リポジトリ直下には一切コピーしないこと（規約 §1「runtime 依存ゼロ」）。
このディレクトリ自体もコミットは統括が行う（本タスクではコミットしない）。

## 1. 実測環境の版（実測値。2026-08-10 確認）

| 項目 | 値 | 確認コマンド |
|---|---|---|
| Chromium (Chrome for Testing) | **149.0.7827.55** | `/usr/local/share/ms-playwright/chromium-1228/chrome-linux64/chrome --version --no-sandbox` |
| Playwright (Python) | **1.61.0** | `/opt/playwright/bin/pip show playwright` |
| Playwright ブラウザバイナリ管理ID | `chromium-1228` | `ls /usr/local/share/ms-playwright/` |
| Node.js | v26.5.0 | `node --version` |
| Python (venv, Playwright実行用) | 3.14.4 | `/opt/playwright/bin/python3 --version` |

Playwright は Dockerfile の記載どおり Python 版が `/opt/playwright` の venv に導入されている
（`playwright` コマンド自体は `/usr/local/bin/playwright` にシンボリックリンク済み）。
ブラウザ実行は **`/opt/playwright/bin/python3` 経由**で行うこと（system python3 に playwright は無い）。

## 2. B-10（層3 DPU）の可否判定

**判定: 可。`--enable-experimental-web-platform-features` を付けて Chromium 149.0.7827.55 を起動すると
`Element.prototype.streamHTML` / `Element.prototype.streamHTMLUnsafe` が関数として存在し、実際に
`streamHTMLUnsafe()` の返す `WritableStream` へ書き込むと DOM に反映されることを確認した。**

再現: `/opt/playwright/bin/python3 .devcontainer/measure/probe-dpu.py`

要点（実測ログの詳細は作業記録に残す。本書は再現手順と結論のみ）:

- フラグなしでは `streamHTML` / `streamHTMLUnsafe` は `undefined`（`setHTMLUnsafe`/`setHTML` は
  フラグ無しでも存在＝これらは既に安定版）。
- `--enable-experimental-web-platform-features` を付けると両方とも `function` になる。
- Chromium バイナリには `chrome://flags/#document-patching`・`chrome://flags/#route-matching`
  （Blink feature名 `DocumentPatching` / `RouteMatching`）という**個別フラグも strings 抽出で存在確認**したが、
  `--enable-blink-features=DocumentPatching,RouteMatching` を指定しても `streamHTMLUnsafe` は生えなかった
  （実測で確認・空振り）。**API の有効化には `--enable-experimental-web-platform-features` を使うこと**。
- `streamHTMLUnsafe()` は引数なしで呼ぶと `WritableStream` を返し、そこへ文字列チャンクを `write()` すると
  呼び出し元要素の中身が（既存の子を消して）ストリームされた HTML に置き換わる。挙動として
  「既存コンテンツのクリア＋新規ストリーム流し込み」であり、`replace-self` 相当の候補として矛盾しない。
  ただしこれは環境確認レベルの動作確認であり、**`replace-self` の名称対応・エリアを跨ぐ実運用シナリオでの
  検証は T1-12 の担当**（B-10 本実測）。
- `streamHTMLUnsafe(options)` は `SetHTMLUnsafeOptions.sanitizer` に `SanitizerPresets` の enum 値のみ受け付ける
  （任意文字列を渡すと `TypeError`）。既定サニタイザの中身（B-1）とあわせて T1-12/T1-11 で要確認。

## 3. 使い捨て HTTP サーバー（`server.py`）

依存ライブラリなし（Python 標準ライブラリ `http.server` のみ）。system python3 で動く。

```
python3 .devcontainer/measure/server.py \
  --root <配信したい静的ファイルのディレクトリ> \
  --port 8123 \
  --csp "default-src 'self'; script-src 'nonce-{nonce}' 'sha256-AAAA='" \
  --redirect "/old-path=/new-path"
```

### 機能

| 機能 | 使い方 |
|---|---|
| 任意の CSP ヘッダ | `--csp "<値>"`（全パス共通）。`{nonce}` を埋め込むと nonce 埋め込み機能と自動連動 |
| パスごとに違う CSP | `--csp-map <JSON path>`（`{"/a/": "...", "/b/": "...", "/c/": "..."}` の形。**B-11 の (a)/(b)/(c) を1サーバーで同時に持てる**） |
| 302 リダイレクト（固定） | `--redirect FROM=TO` を複数回指定可（**B-3**: `X-Partial` 等のヘッダがリダイレクト先まで維持されるかの確認に使う） |
| 302 リダイレクト（任意） | `GET /__redirect__?to=<URL>&status=302` |
| リクエストヘッダのエコー | `GET /__headers__` → 受信ヘッダを JSON で返す（redirect 先に置いて `fetch` 側の `X-Partial` 到達を確認する） |
| nonce 埋め込み | 配信する `.html` に `{{NONCE}}` というトークンを書いておくと、リクエストごとに生成した nonce へ置換し、
  同じ値を CSP ヘッダの `{nonce}` にも反映する（`--nonce-token` で変更可） |

### B-11 (a)/(b)/(c) 用の CSP 例

規約 `docs/conventions.md` §9.1 の3構成に対応する `--csp-map` 例:

```json
{
  "/a/": "default-src 'self'; script-src 'nonce-{nonce}' 'sha256-<import-map-hash>'",
  "/b/": "default-src 'self'; script-src 'nonce-{nonce}' 'sha256-<import-map-hash>' <BASE_URL>/assets/platform/shared/ <BASE_URL>/assets/platform/client/ ...",
  "/c/": "default-src 'self'; script-src 'nonce-{nonce}' 'sha256-<import-map-hash>' 'strict-dynamic'"
}
```

`<import-map-hash>` と `<BASE_URL>/assets/...` は T1-11 で骨格 `dist/` から実際に算出・配置した値に置き換えること
（本タスクでは骨格が未着手のためプレースホルダのまま）。

### 起動確認済み（2026-08-10 実測。詳細ログは作業記録側）

- 静的ファイル配信 + nonce 埋め込み: 確認済み（配信 HTML 内の `{{NONCE}}` と `Content-Security-Policy` ヘッダの
  nonce が同一値で一致することを curl で確認）
- パス別 CSP 切り替え（`/a/` `/b/` `/c/`）: 確認済み
- 固定 302 リダイレクト（`--redirect`）: 確認済み
- 任意 302 リダイレクト + ヘッダエコー（`/__redirect__` → `/__headers__`）: 確認済み
  （`curl -L -H "X-Partial: main"` で `/__headers__` の応答 JSON に `X-Partial` が残ることを確認。
  ただしこれは curl のリダイレクト追従の挙動であり、**ブラウザの `fetch()` 自体の追従挙動確認は T1-12 の担当**）

### 終了方法

フォアグラウンド実行のため `Ctrl-C`。バックグラウンド起動した場合は `pkill -f "measure/server.py"` 等で止めること。
使い捨てのため、実測が終わったプロセスは残さない。

## 4. DPU プローブ（`probe-dpu.py`）

`/opt/playwright/bin/python3 .devcontainer/measure/probe-dpu.py` で実行。
`--enable-experimental-web-platform-features` の有無で `streamHTML`/`streamHTMLUnsafe` の有無を比較し、
関数が存在する場合は実際に書き込んで DOM 反映まで確認する（詳細は本ファイル §2）。

## 5. 実測記録テンプレート

`record-template.md` を各実測タスク（T1-9〜T1-13）でコピーして使うこと。
確認日・ブラウザ版・実コマンド・実出力を必ず埋める（規約 §12.5 の要件）。

## `permission/deploy/` について

`permission/` の実測は、納品構成（`dist/` `public/` `db/` `.env` `package.json` だけを置いた状態）を
`permission/deploy/` へ組み立てて起動する。**このディレクトリはハーネスが生成する作業領域であり、
git の追跡対象にしない**（`.devcontainer/.gitignore` で除外）。リポジトリ本体の複製が混ざると、
本体を直したときに気づかないまま乖離するため。再実測のたびに作り直してよい。
