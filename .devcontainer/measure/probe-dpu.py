#!/usr/bin/env python3
"""
sugumi フェーズ1 実測用: 層3 (DPU = Declarative Partial Updates) の API 有無を
実ブラウザで確認するプローブ（T1-8 成果物）。

- 納品物ではない。`.devcontainer/` 配下にのみ置くこと。
- 依存: Playwright（Dockerfile で venv 導入済み。`/opt/playwright/bin/python3` から実行する）。
- 用途: `--enable-experimental-web-platform-features` の可否と、DPU 関連 API
  （`Element.prototype.streamHTML` / `streamHTMLUnsafe`）の存在を Chromium 上で直接確認する。
  B-10（層3 API名・`replace-self` 相当）の実測本体は T1-12 が別途行う。本スクリプトは
  T1-8 の完了条件である「可否判定の材料」を得るための環境確認用。

実行:
    /opt/playwright/bin/python3 .devcontainer/measure/probe-dpu.py
"""

from playwright.sync_api import sync_playwright


def probe(args: list[str]) -> dict:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=args)
        page = browser.new_page()
        page.set_content("<!DOCTYPE html><html><body><div id='t'>orig</div></body></html>")
        result = page.evaluate("""async () => {
            const out = {
                chromeVersion: navigator.userAgent,
                elementStreamHTML: typeof Element.prototype.streamHTML,
                elementStreamHTMLUnsafe: typeof Element.prototype.streamHTMLUnsafe,
                elementSetHTMLUnsafe: typeof Element.prototype.setHTMLUnsafe,
                elementSetHTML: typeof Element.prototype.setHTML,
            };
            if (typeof Element.prototype.streamHTMLUnsafe === "function") {
                try {
                    const target = document.getElementById('t');
                    const writable = target.streamHTMLUnsafe();
                    const writer = writable.getWriter();
                    await writer.write('<span id="probe-ok">1</span>');
                    await writer.close();
                    out.functionalTest = document.getElementById('probe-ok') ? 'pass' : 'fail';
                } catch (e) {
                    out.functionalTest = 'error:' + e.message;
                }
            } else {
                out.functionalTest = 'skipped(api-absent)';
            }
            return out;
        }""")
        ver = browser.version
        browser.close()
        return {"browserVersion": ver, **result}


def main():
    scenarios = {
        "no-flag": [],
        "enable-experimental-web-platform-features": ["--enable-experimental-web-platform-features"],
    }
    for label, args in scenarios.items():
        print(f"=== {label} (args={args}) ===")
        r = probe(args)
        for k, v in r.items():
            print(f"  {k}: {v}")
        print()


if __name__ == "__main__":
    main()
