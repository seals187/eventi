import { h, mySurveys, removeMySurvey, adminUrl, iconBtn, icon, store, setChildren } from "./util.js";
import { t, fmtDate, onLangChange, setLang, currentLang } from "./i18n.js";
import { api, currentUser, isAdmin, refreshSession, clearSession } from "./api.js";

let serverSurveys = [];

// --- UI zoom (per browser): 70 % .. 110 % in 5 % steps, applied with CSS zoom on <html> ----
const ZOOM_KEY = "eventi:zoom";
const ZOOM_MIN = 70, ZOOM_MAX = 110, ZOOM_STEP = 5;
const BASE_SCALE = 0.875;
let zoom = Number(store.get(ZOOM_KEY)) || 100;

function applyZoom() {
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom / ZOOM_STEP) * ZOOM_STEP));
  // The level is relative to the base scale set in app.css (html { zoom: .875 })
  document.documentElement.style.zoom = zoom === 100 ? "" : String((BASE_SCALE * zoom) / 100);
}
// Apply as early as possible (module load), before the page renders its content
applyZoom();

function setZoom(delta) {
  zoom += delta;
  applyZoom();
  if (zoom === 100) store.del(ZOOM_KEY);
  else store.set(ZOOM_KEY, zoom);
  renderZoom();
}

// "− +" buttons left of the account menu
function renderZoom() {
  let slot = document.getElementById("zoom-ctl");
  const account = document.getElementById("account-menu");
  if (!slot && account) {
    slot = h("div", { id: "zoom-ctl", class: "zoom-ctl", role: "group" });
    account.before(slot);
  }
  if (!slot) return;
  slot.setAttribute("aria-label", t("zoom.label", { n: zoom }));
  slot.title = t("zoom.label", { n: zoom });
  setChildren(slot,
    h("button", { type: "button", class: "zoom-btn", disabled: zoom <= ZOOM_MIN, "aria-label": t("zoom.out", { n: zoom - ZOOM_STEP }), title: t("zoom.out", { n: zoom - ZOOM_STEP }), onclick: () => setZoom(-ZOOM_STEP) }, "−"),
    zoom !== 100 && h("button", { type: "button", class: "zoom-val", "aria-label": t("zoom.reset"), title: t("zoom.reset"), onclick: () => setZoom(100 - zoom) }, `${zoom}%`),
    h("button", { type: "button", class: "zoom-btn", disabled: zoom >= ZOOM_MAX, "aria-label": t("zoom.in", { n: zoom + ZOOM_STEP }), title: t("zoom.in", { n: zoom + ZOOM_STEP }), onclick: () => setZoom(ZOOM_STEP) }, "+"));
}

// Own surveys of the logged-in account (newest first), loaded by initHeader()
export const ownSurveys = () => serverSurveys;

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
  renderZoom();
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
