import { loadI18n } from "../../../web/_client/i18n.ts";

const { t } = await loadI18n();

for (const password of document.querySelectorAll<HTMLInputElement>('input[type="password"]')) {
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.textContent = t("form.password.show");
  toggleButton.setAttribute("aria-pressed", "false");
  toggleButton.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggleButton.setAttribute("aria-pressed", String(show));
  });
  (password.closest("label") ?? password).after(toggleButton);

  password.form?.addEventListener("submit", () => {
    password.type = "password";
    toggleButton.setAttribute("aria-pressed", "false");
  });
}
