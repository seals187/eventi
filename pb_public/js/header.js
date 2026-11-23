import { h, mySurveys, removeMySurvey, adminUrl, iconBtn, icon } from "./util.js";
import { t, fmtDate, onLangChange, setLang, currentLang } from "./i18n.js";
import { api, currentUser, isAdmin, refreshSession, clearSession } from "./api.js";

let serverSurveys = [];

// Renews the session, then renders the header menus. Pages await this before
// rendering, so currentUser() is up to date.
export async function initHeader() {
  const user = await refreshSession();
  if (user) {
    // Language follows the account across devices
    if (user.lang && user.lang !== currentLang()) await setLang(user.lang);
    try { serverSurveys = await api.mySurveys(); } catch { serverSurveys = []; }
  }
  // Remember the language in the account when switched in the header
  document.getElementById("lang")?.addEventListener("change", (e) => {
    if (currentUser()) api.updateMe({ lang: e.target.value }).catch(() => {});
  });
  renderHeader();
  onLangChange(renderHeader);
  // Close open dropdowns when clicking elsewhere
  document.addEventListener("click", (e) => {
    document.querySelectorAll("details.menu[open]").forEach((d) => {
      if (!d.contains(e.target)) d.open = false;
    });
  });
}

function renderHeader() {
  renderMineMenu();
  renderAccountMenu();
}

export const loginUrl = (next = location.pathname + location.search + location.hash) =>
  `login.html?next=${encodeURIComponent(next)}`;

// Surveys of the account plus admin links opened in this browser (e.g. shared co-admin links)
function mineList() {
  const own = serverSurveys.map((s) => ({ ...s, own: true }));
  const ids = new Set(own.map((s) => s.id));
  return [...own, ...mySurveys().filter((m) => !ids.has(m.id))];
}

// "My polls · n" dropdown in the header
export async function renderMineMenu(reload = false) {
  const slot = document.getElementById("mine-menu");
  if (!slot) return;
  if (reload && currentUser()) {
    try { serverSurveys = await api.mySurveys(); } catch { /* keep old list */ }
  }
  const list = mineList();
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
            h("small", {},
              m.created && fmtDate(new Date(m.created), { dateStyle: "medium" }),
              m.own && ` · ${t("vote.participants", { n: m.count })}`,
              m.is_closed && ` · ${t("status.closed")}`,
              !m.own && ` · ${t("mine.via_link")}`)),
          !m.own && iconBtn(icon("x"), t("mine.forget"), false, (e) => {
            e.stopPropagation();
            if (!confirm(t("mine.forget_confirm"))) return;
            removeMySurvey(m.id);
            renderMineMenu();
          })))))));
}

function renderAccountMenu() {
  const slot = document.getElementById("account-menu");
  if (!slot) return;
  const user = currentUser();
  if (!user) {
    if (location.pathname.endsWith("/login.html")) return slot.replaceChildren();
    slot.replaceChildren(h("a", { class: "pill-btn", href: loginUrl() }, t("auth.login")));
    return;
  }
  const initial = (user.display_name || user.email || "?").trim().charAt(0).toUpperCase();
  const item = (href, ic, label, cls = "") => h("a", { class: `menu-item ${cls}`, href }, icon(ic), label);
  slot.replaceChildren(h("details", { class: "menu" },
    h("summary", { class: "avatar-btn", title: user.email, "aria-label": t("account.menu") }, initial),
    h("div", { class: "menu-pop" },
      h("div", { class: "menu-who" }, h("strong", {}, user.display_name), h("small", {}, user.email)),
      item("./", "plus", t("account.new_survey")),
      item("account.html", "user", t("account.title")),
      isAdmin() && item("users.html", "users", t("users.title")),
      h("button", {
        type: "button", class: "menu-item danger",
        onclick: () => {
          clearSession();
          location.href = "./login.html";
        },
      }, icon("logout"), t("auth.logout")))));
}
