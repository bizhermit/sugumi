document.addEventListener("submit", (e) => {
  if (e.defaultPrevented || !(e.target instanceof HTMLFormElement) || !e.target.classList.contains("_form")) return;
  if (e.target.getAttribute("aria-busy") === "true") {
    e.preventDefault();
    return;
  }
  e.target.setAttribute("aria-busy", "true");
  // TODO: schema validation
});

addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  for (const elem of document.querySelectorAll("._form[aria-busy]")) {
    elem.removeAttribute("aria-busy");
  }
});

document.querySelectorAll("._form").forEach((elem) => {
  if (!(elem instanceof HTMLFormElement)) return;
  elem.noValidate = true;
});
