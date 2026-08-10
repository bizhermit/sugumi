#!/usr/bin/env python3
"""
T1-12 実測スクリプト: 付録B-1 / B-3 / B-6 / B-7 / B-10。

- 納品物ではない。`.devcontainer/` 配下にのみ置くこと。
- 依存: Playwright（`/opt/playwright/bin/python3` で実行すること）。
  `server.py` の起動自体は system python3（stdlib のみ）で行う。
- フィクスチャ: `.devcontainer/measure/fixtures/t112/index.html`（空のホストページ。
  各測定はこのページ上で `page.evaluate` による DOM 操作として行う）。

実行:
    /opt/playwright/bin/python3 .devcontainer/measure/measure-t112.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures" / "t112"
PORT = 8300
BASE = f"http://127.0.0.1:{PORT}"


def start_server() -> subprocess.Popen:
    proc = subprocess.Popen(
        [
            "python3",
            str(HERE / "server.py"),
            "--root", str(FIXTURES),
            "--port", str(PORT),
            # B-3: 固定302リダイレクト。リダイレクト先 /__headers__ は server.py 組み込みの
            # 「受信ヘッダをJSONで返す」エンドポイント（T1-8 成果物）。
            "--redirect", "/old-partial=/__headers__",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    for _ in range(50):
        line = proc.stdout.readline()
        if "serving" in line:
            sys.stderr.write(line)
            break
        time.sleep(0.05)
    return proc


# ---------------------------------------------------------------------------
# B-1: 既定サニタイザ(setHTML) × DSD（§4.6）
# ---------------------------------------------------------------------------

B1_SCRIPT = """
() => {
  const out = {};

  // --- パターンA: 「自分自身が shadow host」（setHTML/setHTMLUnsafe を呼ぶ対象そのものに
  //     shadowrootmode を適用しようとするケース）。
  //     HTML仕様上、フラグメント解析の「context element」自身は shadow host になれない制限があり、
  //     これは setHTMLUnsafe でも通らないことを先に確認しておく（実装バグではなく仕様上の制限）。
  const selfMarkup = '<template shadowrootmode="open"><p id="mark">hi</p></template>';

  const aInner = document.createElement('div');
  document.body.appendChild(aInner);
  aInner.innerHTML = selfMarkup;
  out.patternA_selfHost_innerHTML = { hasShadowRoot: aInner.shadowRoot !== null };

  const aUnsafe = document.createElement('div');
  document.body.appendChild(aUnsafe);
  aUnsafe.setHTMLUnsafe(selfMarkup);
  out.patternA_selfHost_setHTMLUnsafe = {
    hasShadowRoot: aUnsafe.shadowRoot !== null,
    note: 'context element 自身は shadow host になれない制限（仕様）。false が期待値',
  };

  // --- パターンB（本題・実運用パターン）: 「descendant が shadow host」。
  //     CE+DSD の実際の使い方（例: <task-card><template shadowrootmode="open">...）そのもの。
  //     target（呼び出し対象）自身ではなく、target の「子」として挿入される要素が shadow host になる。
  const descMarkup = '<div id="inner-host"><template shadowrootmode="open"><p id="mark">hi</p></template></div>';

  const bInner = document.createElement('div');
  document.body.appendChild(bInner);
  bInner.innerHTML = descMarkup;
  const bInnerHost = bInner.querySelector('#inner-host');
  out.patternB_descendantHost_innerHTML = {
    hasShadowRoot: bInnerHost ? bInnerHost.shadowRoot !== null : null,
  };

  const bUnsafe = document.createElement('div');
  document.body.appendChild(bUnsafe);
  bUnsafe.setHTMLUnsafe(descMarkup);
  const bUnsafeHost = bUnsafe.querySelector('#inner-host');
  out.patternB_descendantHost_setHTMLUnsafe = {
    hasShadowRoot: bUnsafeHost ? bUnsafeHost.shadowRoot !== null : null,
    shadowText: bUnsafeHost && bUnsafeHost.shadowRoot ? bUnsafeHost.shadowRoot.getElementById('mark')?.textContent ?? null : null,
  };

  // 本題: setHTML（既定サニタイザ）で descendant host パターン
  const target = document.createElement('div');
  document.body.appendChild(target);
  target.setHTML(descMarkup);
  const targetHost = target.querySelector('#inner-host');
  out.patternB_descendantHost_setHTML = {
    innerHostFound: !!targetHost,
    hasShadowRoot: targetHost ? targetHost.shadowRoot !== null : null,
    outerHTMLAfter: target.outerHTML,
  };

  // 補足: template 要素自体（shadowrootmode 無し）が既定サニタイザで残るかどうかの切り分け
  const plainTemplate = document.createElement('div');
  document.body.appendChild(plainTemplate);
  plainTemplate.setHTML('<template><p>plain</p></template>');
  out.supplementary_plainTemplateSurvives = plainTemplate.querySelector('template') !== null;

  // 補足: id / class / data-* など一般属性が既定サニタイザで残るかどうか（DSD固有ではない一般的挙動の確認）
  const plainAttrs = document.createElement('div');
  document.body.appendChild(plainAttrs);
  plainAttrs.setHTML('<div id="x" class="c" data-y="1">t</div>');
  out.supplementary_genericAttrsSurvive = plainAttrs.innerHTML;

  return out;
}
"""


def measure_b1(page) -> dict:
    return page.evaluate(B1_SCRIPT)


# ---------------------------------------------------------------------------
# B-3: fetch のリダイレクト追従時にカスタムヘッダ(X-Partial)が維持されるか（§7.4/§8.3）
# ---------------------------------------------------------------------------

B3_SCRIPT = """
async (base) => {
  // 対照: リダイレクトなしで直接 /__headers__ を叩き、ヘッダが素直に届くことを確認する（ベースライン）
  const baseline = await fetch(base + '/__headers__', {
    headers: { 'X-Partial': 'main-region' },
  });
  const baselineJson = await baseline.json();

  // 本題: 302 を挟んだ場合（/old-partial -> /__headers__）に X-Partial が維持されるか
  const redirected = await fetch(base + '/old-partial', {
    redirect: 'follow',
    headers: { 'X-Partial': 'main-region' },
  });
  const redirectedJson = await redirected.json();

  return {
    baseline: { status: baseline.status, xPartial: baselineJson['X-Partial'] ?? null },
    redirected: {
      status: redirected.status,
      wasRedirected: redirected.redirected,
      finalUrl: redirected.url,
      xPartial: redirectedJson['X-Partial'] ?? null,
    },
  };
}
"""


def measure_b3(page) -> dict:
    return page.evaluate(B3_SCRIPT, BASE)


# ---------------------------------------------------------------------------
# B-6: parseHTMLUnsafe で構築したノードを別文書へ移送したとき DSD が保持されるか（§4.5 replace-self）
# ---------------------------------------------------------------------------

B6_SCRIPT = """
async () => {
  const out = { available: typeof Document.parseHTMLUnsafe === 'function' };
  if (!out.available) return out;

  // --- シナリオ1: 実運用の経路そのもの（§4.5 の replace-self 実装経路）---
  // target.replaceWith(node) は仕様上、挿入前に node を target の所属文書へ暗黙 adopt する。
  // parseHTMLUnsafe が返す Document は「別文書」であるため、これ自体が B-6 の実測シナリオである。
  const target = document.createElement('div');
  target.id = 'repl-target';
  document.body.appendChild(target);

  const parsedDoc = Document.parseHTMLUnsafe(
    '<div id="host"><template shadowrootmode="open"><p id="mark">ok</p></template></div>'
  );
  const nodeInOtherDoc = parsedDoc.getElementById('host');
  const beforeMove = {
    ownerDocIsMain: nodeInOtherDoc.ownerDocument === document,
    hasShadowRoot: nodeInOtherDoc.shadowRoot !== null,
    shadowText: nodeInOtherDoc.shadowRoot ? nodeInOtherDoc.shadowRoot.getElementById('mark')?.textContent ?? null : null,
  };

  target.replaceWith(nodeInOtherDoc);
  const afterMove = {
    ownerDocIsMainNow: nodeInOtherDoc.ownerDocument === document,
    isConnected: nodeInOtherDoc.isConnected,
    hasShadowRoot: nodeInOtherDoc.shadowRoot !== null,
    shadowText: nodeInOtherDoc.shadowRoot ? nodeInOtherDoc.shadowRoot.getElementById('mark')?.textContent ?? null : null,
  };

  out.replaceWithScenario = { beforeMove, afterMove };

  // --- シナリオ2: より極端なケース。iframe（本当に別のブラウジングコンテキスト＋別 Document）へ adoptNode で移送 ---
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  await new Promise((resolve) => {
    iframe.addEventListener('load', resolve, { once: true });
    iframe.src = 'about:blank';
  });
  const otherDoc = iframe.contentDocument;

  const parsedDoc2 = Document.parseHTMLUnsafe(
    '<div id="host2"><template shadowrootmode="open"><p id="mark2">ok2</p></template></div>'
  );
  const node2 = parsedDoc2.getElementById('host2');
  const adopted = otherDoc.adoptNode(node2);
  otherDoc.body.appendChild(adopted);
  out.iframeAdoptScenario = {
    ownerDocIsIframeDoc: adopted.ownerDocument === otherDoc,
    hasShadowRoot: adopted.shadowRoot !== null,
    shadowText: adopted.shadowRoot ? adopted.shadowRoot.getElementById('mark2')?.textContent ?? null : null,
  };

  // --- 陰性対照: DSD を含まない要素の移送で shadowRoot が「無いままである」ことを確認する
  //     （常に true を返す検査バグでないことの確認）
  const plainDoc = Document.parseHTMLUnsafe('<div id="plain">no shadow here</div>');
  const plainNode = plainDoc.getElementById('plain');
  const plainAdopted = otherDoc.adoptNode(plainNode);
  otherDoc.body.appendChild(plainAdopted);
  out.negativeControl = {
    hasShadowRootAfterMove: plainAdopted.shadowRoot !== null, // 期待値: false
  };

  return out;
}
"""


def measure_b6(page) -> dict:
    return page.evaluate(B6_SCRIPT)


# ---------------------------------------------------------------------------
# B-7: setHTMLUnsafe() で挿入された要素の autofocus が発火するか（§5.5）
# ---------------------------------------------------------------------------

B7_SCRIPT = """
async () => {
  const out = {};

  // 本題: autofocus 付きボタンを setHTMLUnsafe で挿入
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.setHTMLUnsafe('<button id="af-btn" autofocus>focus me</button>');
  // autofocus 処理はマイクロタスク/フレーム後に走る可能性があるため rAF を1回はさむ
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => requestAnimationFrame(() => r()));
  out.withAutofocus = {
    activeElementId: document.activeElement ? document.activeElement.id : null,
    focused: document.activeElement && document.activeElement.id === 'af-btn',
  };

  // 陰性対照: autofocus を付けない場合は activeElement が変わらないことを確認
  const host2 = document.createElement('div');
  document.body.appendChild(host2);
  host2.setHTMLUnsafe('<button id="noaf-btn">no autofocus</button>');
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => requestAnimationFrame(() => r()));
  out.withoutAutofocus = {
    activeElementId: document.activeElement ? document.activeElement.id : null,
    incorrectlyFocused: document.activeElement && document.activeElement.id === 'noaf-btn',
  };

  out.documentHasFocus = document.hasFocus();
  return out;
}
"""


def measure_b7(page) -> dict:
    return page.evaluate(B7_SCRIPT)


# ---------------------------------------------------------------------------
# B-10: 層3(DPU) の適用 API 名 と replace-self 相当の経路の有無（§4.5 Q34）
# ---------------------------------------------------------------------------

SURFACE_SCRIPT = """
() => {
  const pattern = /stream|patch|declarative|partial|marker|route/i;
  const targets = {
    Element: Element.prototype,
    Document: Document.prototype,
    Node: Node.prototype,
    ChildNode: (typeof ChildNode !== 'undefined') ? ChildNode.prototype : null,
    HTMLTemplateElement: (typeof HTMLTemplateElement !== 'undefined') ? HTMLTemplateElement.prototype : null,
  };
  const out = {};
  for (const [name, proto] of Object.entries(targets)) {
    out[name] = proto ? Object.getOwnPropertyNames(proto).filter((n) => pattern.test(n)).sort() : null;
  }
  return out;
}
"""

B10_FUNCTIONAL_SCRIPT = """
async () => {
  const out = { available: typeof Element.prototype.streamHTMLUnsafe === 'function' };
  if (!out.available) return out;

  const host = document.createElement('div');
  host.id = 'dpu-host-original';
  host.setAttribute('data-marker', 'original');
  document.body.appendChild(host);
  const parent = host.parentNode;

  const before = {
    tag: host.tagName,
    id: host.id,
    attr: host.getAttribute('data-marker'),
  };

  const writable = host.streamHTMLUnsafe({ runScripts: false });
  const writer = writable.getWriter();
  await writer.write('<span id="dpu-child">streamed</span>');
  await writer.close();

  out.functional = {
    hostStillSameNode: parent.contains(host),
    hostIdUnchanged: host.id === before.id,
    hostAttrUnchanged: host.getAttribute('data-marker') === before.attr,
    hostTagUnchanged: host.tagName === before.tag,
    childHTML: host.innerHTML,
    // これが true のままなら streamHTMLUnsafe は「要素自身の置換(replace-self)」ではなく
    // 「子要素の置換(replace-children)」であることの証拠になる
    semantics: (parent.contains(host) && host.id === before.id) ? 'replace-children' : 'replace-self-or-unknown',
  };

  // --- streamReplaceWithHTMLUnsafe（surface 列挙で発見。replace-self 相当の候補） ---
  out.replaceSelfCandidateAvailable = typeof Element.prototype.streamReplaceWithHTMLUnsafe === 'function';
  if (out.replaceSelfCandidateAvailable) {
    const rsHost = document.createElement('div');
    rsHost.id = 'replace-self-host';
    rsHost.setAttribute('data-marker', 'original-rs');
    document.body.appendChild(rsHost);
    const rsParent = rsHost.parentNode;

    const rsWritable = rsHost.streamReplaceWithHTMLUnsafe({ runScripts: false });
    const rsWriter = rsWritable.getWriter();
    // DSD も同時に確認する（layer3 経由でも shadow root が保持されるか）
    await rsWriter.write('<div id="replaced-el"><template shadowrootmode="open"><p id="rs-mark">rs-ok</p></template></div>');
    await rsWriter.close();

    const hostStillInDom = document.getElementById('replace-self-host');
    const replacedEl = document.getElementById('replaced-el');
    out.replaceSelfFunctional = {
      originalHostRemoved: hostStillInDom === null,
      newElementPresent: replacedEl !== null,
      newElementSameParent: !!replacedEl && replacedEl.parentNode === rsParent,
      newElementHasShadowRoot: !!replacedEl && replacedEl.shadowRoot !== null,
      newElementShadowText: (replacedEl && replacedEl.shadowRoot) ? (replacedEl.shadowRoot.getElementById('rs-mark')?.textContent ?? null) : null,
      semantics: (hostStillInDom === null && replacedEl !== null) ? 'replace-self (confirmed)' : 'unexpected',
    };
  }

  return out;
}
"""


def measure_b10(browser_launcher) -> dict:
    out = {}
    for label, args in (
        ("no-flag", []),
        ("enable-experimental-web-platform-features", ["--enable-experimental-web-platform-features"]),
    ):
        browser = browser_launcher(args)
        page = browser.new_page()
        page.goto(f"{BASE}/index.html")
        surface = page.evaluate(SURFACE_SCRIPT)
        functional = page.evaluate(B10_FUNCTIONAL_SCRIPT)
        out[label] = {"surface": surface, "functional": functional}
        page.close()
        browser.close()
    return out


def main():
    server = start_server()
    try:
        with sync_playwright() as p:
            def launch(args):
                return p.chromium.launch(headless=True, args=args)

            browser = launch([])
            page = browser.new_page()
            page.goto(f"{BASE}/index.html")
            browser_version = browser.version

            report = {
                "chromium_version": browser_version,
                "B1_default_sanitizer_dsd": measure_b1(page),
                "B3_fetch_redirect_header": measure_b3(page),
                "B6_parseHTMLUnsafe_transfer_dsd": measure_b6(page),
                "B7_autofocus_setHTMLUnsafe": measure_b7(page),
            }
            page.close()
            browser.close()

            report["B10_dpu_api_surface"] = measure_b10(launch)

        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
