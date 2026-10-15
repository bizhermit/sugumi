/// <reference lib="dom" />

/**
 * 送信中のフォームをもう一度送信させない。送信中のフォームには aria-busy="true" を付ける。
 *
 * ページ側で送信を取り消すときは、document ではなくフォーム要素に付けたリスナーで preventDefault すること。
 * フォーム要素のリスナーは document のリスナーより先に呼ばれるため、取り消した送信を送信中として扱わずに済む。
 */

document.addEventListener("submit", (e) => {
  if (e.defaultPrevented || !(e.target instanceof HTMLFormElement)) return;
  if (e.target.getAttribute("aria-busy") === "true") {
    e.preventDefault();
    return;
  }
  e.target.setAttribute("aria-busy", "true");
});

// 戻るボタンでキャッシュから表示されたページは、送信したときの状態のまま残っている
addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  for (const form of document.querySelectorAll("form[aria-busy]")) {
    form.removeAttribute("aria-busy");
  }
});
