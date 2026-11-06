document.addEventListener("submit", (e) => {
  if (e.defaultPrevented || !(e.target instanceof HTMLFormElement)) return;
  if (e.target.getAttribute("aria-busy") === "true") {
    e.preventDefault();
    return;
  }
  e.target.setAttribute("aria-busy", "true");
});

addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  for (const form of document.querySelectorAll("form[aria-busy]")) {
    form.removeAttribute("aria-busy");
  }
});
