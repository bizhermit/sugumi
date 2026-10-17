/// <reference lib="dom" />

document.getElementById("logout")?.addEventListener("submit", (e) => {
  if (!confirm("ログアウトしますか？")) e.preventDefault();
});
