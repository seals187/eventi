import { h, mySurveys, removeMySurvey, adminUrl, iconBtn, icon } from "./util.js";
import { t, fmtDate, onLangChange } from "./i18n.js";

export function initHeader() {
  renderMineMenu();
  onLangChange(renderMineMenu);
  // Close open dropdowns when clicking elsewhere
  document.addEventListener("click", (e) => {
    document.querySelectorAll("details.menu[open]").forEach((d) => {
      if (!d.contains(e.target)) d.open = false;
    });
  });
}

// "My polls · n" dropdown in the header, listing admin links stored in this browser
export function renderMineMenu() {
  const slot = document.getElementById("mine-menu");
  if (!slot) return;
  const list = mySurveys();
  if (!list.length) {
    slot.replaceChildren();
    return;
  }
  slot.replaceChildren(h("details", { class: "menu" },
    h("summary", { class: "pill-btn" }, `${t("mine.button")} · ${list.length}`),
    h("div", { class: "menu-pop menu-wide" },
      h("p", { class: "menu-title" }, t("mine.button")),
      h("ul", { class: "mine-list" }, list.map((m) =>
        h("li", {},
          h("a", { href: adminUrl(m.id, m.key) },
            h("span", { class: "mine-title" }, m.title || m.id),
            m.created && h("small", {}, fmtDate(new Date(m.created), { dateStyle: "medium" }))),
          iconBtn(icon("x"), t("mine.forget"), false, (e) => {
            e.stopPropagation();
            if (!confirm(t("mine.forget_confirm"))) return;
            removeMySurvey(m.id);
            renderMineMenu();
          })))))));
}
