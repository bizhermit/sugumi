#!/usr/bin/env python3
"""
T1-11 実測スクリプト: 付録B-11 (a)/(b)/(c) ＋ 付録B-2（import map 3エントリ）。

- 納品物ではない。`.devcontainer/` 配下にのみ置くこと。
- 依存: Playwright（`/opt/playwright/bin/python3` で実行すること）。
  `server.py` の起動自体は system python3（stdlib のみ）で行う。
- フィクスチャ: `.devcontainer/measure/fixtures/b11-b2/`
  - /a/index.html, /b/index.html, /c/index.html … 同一内容（import map・エントリスクリプトへの参照）。
    CSP ヘッダだけが `csp-map.json` によりパス接頭辞ごとに変わる。
  - /z/index.html … 陰性対照（`script-src 'none'`）。測定手法が実際に失敗を検出できることの自己検証用
    （常に allOk=true になる測定バグではないことの確認）。付録B-11 の (a)/(b)/(c) には含まれない。
  - /assets/... … 実行される4本の JS（pages → components → 基盤、相対 import と bare specifier の両方を含む）。

実行:
    /opt/playwright/bin/python3 .devcontainer/measure/measure-b11.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures" / "b11-b2"
CSP_MAP = FIXTURES / "csp-map.json"
PORT = 8299
BASE = f"http://127.0.0.1:{PORT}"


def start_server() -> subprocess.Popen:
    proc = subprocess.Popen(
        [
            "python3",
            str(HERE / "server.py"),
            "--root", str(FIXTURES),
            "--port", str(PORT),
            "--csp-map", str(CSP_MAP),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    # 起動待ち（ログ行が出るまで軽くポーリング）
    for _ in range(50):
        line = proc.stdout.readline()
        if "serving" in line:
            sys.stderr.write(line)
            break
        time.sleep(0.05)
    return proc


def run_variant(page, label: str) -> dict:
    console_messages: list[str] = []
    page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
    page_errors: list[str] = []
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))

    url = f"{BASE}/{label}/index.html"
    resp = page.goto(url, wait_until="load")
    csp_header = resp.headers.get("content-security-policy") if resp else None

    try:
        page.wait_for_function("window.__B11_RESULT__ !== undefined", timeout=3000)
        result = page.evaluate("window.__B11_RESULT__")
    except Exception as e:  # タイムアウト = スクリプトが実行されなかった（CSPブロック等）
        result = None
        console_messages.append(f"[wait_for_function:error] {e}")

    csp_violations = [
        m for m in console_messages
        if "Content Security Policy" in m or "Refused to" in m
    ]

    title = page.title()

    return {
        "label": label,
        "url": url,
        "response_csp_header": csp_header,
        "title": title,
        "result": result,
        "console_messages": console_messages,
        "csp_violations": csp_violations,
        "page_errors": page_errors,
    }


def main():
    server = start_server()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            browser_version = browser.version
            outputs = []
            for label in ("a", "b", "c", "z"):
                page = browser.new_page()
                outputs.append(run_variant(page, label))
                page.close()
            browser.close()

        report = {
            "chromium_version": browser_version,
            "variants": outputs,
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
