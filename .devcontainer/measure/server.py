#!/usr/bin/env python3
"""
sugumi フェーズ1 実測用の使い捨て HTTP サーバー（T1-8 成果物）。

- 納品物ではない。`.devcontainer/` 配下にのみ置くこと。
- 依存: Python 標準ライブラリのみ（`http.server`）。Dockerfile 記載の system python3 で動く。
- 用途: 付録B の実ブラウザ実測（B-1 / B-2 / B-3 / B-6 / B-7 / B-10 / B-11）のうち、
  「任意の CSP ヘッダを付けたい」「302 を返したい」「nonce を埋め込みたい」を満たす最小サーバー。

使い方の概要は同ディレクトリの README.md を参照。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

DEFAULT_NONCE_TOKEN = "{{NONCE}}"
DEFAULT_CSP_NONCE_TOKEN = "{nonce}"


def make_handler(root: Path, csp_global: str | None, csp_map: dict[str, str],
                  redirect_map: dict[str, str], nonce_token: str):

    class Handler(BaseHTTPRequestHandler):
        server_version = "SugumiMeasureHTTP/1.0"

        def log_message(self, fmt, *args):  # noqa: A003
            # 標準エラーへ実測ログとして残す（呼び出し元が実行ログをそのまま記録に転記できるように）
            sys.stderr.write("[measure-server] %s - %s\n" % (self.address_string(), fmt % args))

        # ------------------------------------------------------------------
        # 共通ユーティリティ
        # ------------------------------------------------------------------

        def _csp_for(self, path: str) -> str | None:
            for prefix, csp in csp_map.items():
                if path == prefix or path.startswith(prefix.rstrip("/") + "/"):
                    return csp
            return csp_global

        def _gen_nonce(self) -> str:
            return base64.b64encode(secrets.token_bytes(16)).decode("ascii")

        def _send_common_headers(self, csp_value: str | None):
            if csp_value:
                self.send_header("Content-Security-Policy", csp_value)
            # CSP 実測用途のため、ブラウザ側キャッシュに古い CSP を持ち越させない
            self.send_header("Cache-Control", "no-store")

        # ------------------------------------------------------------------
        # GET / HEAD
        # ------------------------------------------------------------------

        def do_GET(self):  # noqa: N802
            self._handle(body=True)

        def do_HEAD(self):  # noqa: N802
            self._handle(body=False)

        def _handle(self, body: bool):
            parsed = urlsplit(self.path)
            path = parsed.path
            qs = parse_qs(parsed.query)

            # --- (1) 汎用リダイレクトエンドポイント: /__redirect__?to=/xxx&status=302 ---
            if path == "/__redirect__":
                to = qs.get("to", [None])[0]
                status = int(qs.get("status", ["302"])[0])
                if not to:
                    self.send_response(400)
                    self.end_headers()
                    return
                self.send_response(status)
                self.send_header("Location", to)
                self._send_common_headers(self._csp_for(path))
                self.end_headers()
                return

            # --- (2) 設定ファイルによる固定リダイレクト（B-3: X-Partial 維持確認用の固定URL） ---
            if path in redirect_map:
                self.send_response(302)
                self.send_header("Location", redirect_map[path])
                self._send_common_headers(self._csp_for(path))
                self.end_headers()
                return

            # --- (3) リクエストヘッダのエコー（redirect 追従後にヘッダが残っているか確認する用） ---
            if path == "/__headers__":
                payload = json.dumps(dict(self.headers.items()), ensure_ascii=False, indent=2).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self._send_common_headers(self._csp_for(path))
                self.end_headers()
                if body:
                    self.wfile.write(payload)
                return

            # --- (4) 静的ファイル配信（nonce 埋め込み対応） ---
            rel = path.lstrip("/")
            if rel == "":
                rel = "index.html"
            file_path = (root / rel).resolve()
            try:
                file_path.relative_to(root.resolve())
            except ValueError:
                self.send_response(403)
                self.end_headers()
                return

            if not file_path.is_file():
                self.send_response(404)
                self.end_headers()
                if body:
                    self.wfile.write(b"not found")
                return

            csp_value = self._csp_for(path)
            data = file_path.read_bytes()

            if file_path.suffix in (".html", ".htm") and nonce_token.encode("utf-8") in data:
                nonce = self._gen_nonce()
                data = data.replace(nonce_token.encode("utf-8"), nonce.encode("utf-8"))
                if csp_value and DEFAULT_CSP_NONCE_TOKEN in csp_value:
                    csp_value = csp_value.replace(DEFAULT_CSP_NONCE_TOKEN, nonce)

            content_type = {
                ".html": "text/html; charset=utf-8",
                ".htm": "text/html; charset=utf-8",
                ".js": "text/javascript; charset=utf-8",
                ".mjs": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".json": "application/json; charset=utf-8",
            }.get(file_path.suffix, "application/octet-stream")

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self._send_common_headers(csp_value)
            self.end_headers()
            if body:
                self.wfile.write(data)

    return Handler


def parse_kv_pairs(pairs: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in pairs:
        if "=" not in p:
            raise SystemExit(f"invalid KEY=VALUE: {p!r}")
        k, v = p.split("=", 1)
        out[k] = v
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", required=True, help="静的ファイル配信のルートディレクトリ")
    ap.add_argument("--port", type=int, default=8123)
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--csp", default=None,
                     help="全パス共通の Content-Security-Policy ヘッダ値。"
                          "'{nonce}' を含めると nonce 埋め込みと同じ値に自動置換される")
    ap.add_argument("--csp-map", default=None,
                     help="パス接頭辞ごとに CSP を変える場合の JSON ファイル "
                          '(例: {"/a/": "...", "/b/": "..."})')
    ap.add_argument("--redirect", action="append", default=[],
                     help="FROM=TO 形式の固定302リダイレクト。複数指定可")
    ap.add_argument("--nonce-token", default=DEFAULT_NONCE_TOKEN,
                     help="HTML内でnonceに置換されるプレースホルダ文字列")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        raise SystemExit(f"--root が存在しない、またはディレクトリでない: {root}")

    csp_map: dict[str, str] = {}
    if args.csp_map:
        csp_map = json.loads(Path(args.csp_map).read_text(encoding="utf-8"))

    redirect_map = parse_kv_pairs(args.redirect)

    handler_cls = make_handler(root, args.csp, csp_map, redirect_map, args.nonce_token)
    httpd = ThreadingHTTPServer((args.bind, args.port), handler_cls)
    print(f"[measure-server] serving {root} on http://{args.bind}:{args.port} "
          f"(pid={os.getpid()})", file=sys.stderr)
    if args.csp:
        print(f"[measure-server] csp(global)= {args.csp}", file=sys.stderr)
    for k, v in csp_map.items():
        print(f"[measure-server] csp[{k}] = {v}", file=sys.stderr)
    for k, v in redirect_map.items():
        print(f"[measure-server] redirect {k} -> {v} (302)", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
