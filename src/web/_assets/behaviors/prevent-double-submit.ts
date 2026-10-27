/// <reference lib="dom" />

/**
 * 送信中のフォームが二重に送信されるのを防ぐ。送信中のフォームには aria-busy="true" を付ける。
 *
 * ページ側で送信を取り消すときは、document ではなくフォーム要素に付けたリスナーで preventDefault すること。
 * フォーム要素のリスナーは document のリスナーより先に呼ばれるので、取り消した送信が送信中として扱われずに済む。
 */

document.addEventListener("submit", (e) => {
  if (e.defaultPrevented || !(e.target instanceof HTMLFormElement)) return;
  if (e.target.getAttribute("aria-busy") === "true") {
    e.preventDefault();
    return;
  }
  e.target.setAttribute("aria-busy", "true");
});

// 戻るボタンでキャッシュから表示したページは、送信したときの状態のままになっている。
addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  for (const form of document.querySelectorAll("form[aria-busy]")) {
    form.removeAttribute("aria-busy");
  }
});
