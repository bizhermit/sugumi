/// <reference lib="dom" />

const password = document.querySelector<HTMLInputElement>('input[name="password"]');
if (password) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "パスワードを表示";
  toggle.setAttribute("aria-pressed", "false");
  toggle.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
  });
  (password.closest("label") ?? password).after(toggle);

  // 表示したまま送信すると、ブラウザがパスワードとして保存を提案しないことがある
  password.form?.addEventListener("submit", () => {
    password.type = "password";
    toggle.setAttribute("aria-pressed", "false");
  });
}
