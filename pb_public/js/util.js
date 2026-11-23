import { t } from "./i18n.js";

// Tiny DOM builder: h("div", { class: "x", onclick: fn }, "text", child)
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = true;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// Like el.replaceChildren(), but skips null/false/0 from "cond && h(...)" (the native
// method would render them as the text "false" / "0")
export function setChildren(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false && c !== 0 && c !== ""));
}

export const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const params = new URLSearchParams(location.search);
export const hashParams = new URLSearchParams(location.hash.slice(1));

export const publicUrl = (id) => new URL(`s.html?id=${id}`, location.href).href;
export const adminUrl = (id, key) => new URL(`a.html?id=${id}#k=${key}`, location.href).href;
export const editUrl = (id, key) => new URL(`./?edit=${id}#k=${key}`, location.href).href;

// Admin links opened in this browser. Own surveys come from the account
// (/api/eventi/me/surveys); this list keeps links shared by others.
const MINE = "eventi:mine";
export const mySurveys = () => store.get(MINE) || [];
export function saveMySurvey(entry) {
  const list = mySurveys();
  const i = list.findIndex((m) => m.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else list.unshift({ created: new Date().toISOString(), ...entry });
  store.set(MINE, list.slice(0, 50));
}
export function removeMySurvey(id) {
  store.set(MINE, mySurveys().filter((m) => m.id !== id));
}

export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h("textarea", { value: text, style: "position:fixed;opacity:0" });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = t("action.copied");
    setTimeout(() => (btn.textContent = old), 1500);
  }
}

let toastTimer;
export function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 2600);
}

export function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s) => (s || "eventi").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 50) || "eventi";

// UI building blocks shared by all pages

const ICONS = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1.2-3.4 3.7-5 7-5s5.8 1.6 7 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 15c1.6.8 2.8 2.4 3.5 5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3h-3z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  utensils: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v6M3 3v6a4 4 0 0 0 4 4M17 21V3c-2 1.5-3 4-3 7v4h3"/>',
  cake: '<path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 5 0M12 12V8M12 5.5c.8-.7.8-1.8 0-2.5-.8.7-.8 1.8 0 2.5Z"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
};

export function icon(name) {
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return tpl.content.firstChild;
}

export function field(label, control, hint) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), control, hint && h("small", { class: "hint" }, hint));
}

// Pill button that toggles on/off (aria-pressed)
export function toggleChip(label, on, onChange) {
  const btn = h("button", { type: "button", class: "tchip", "aria-pressed": String(!!on) });
  const paint = () => btn.replaceChildren(...(btn.getAttribute("aria-pressed") === "true" ? [icon("check")] : []), label);
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(v));
    paint();
    onChange(v);
  });
  paint();
  return btn;
}

// Dropdown built on <details>; closed by the outside-click handler in header.js
export function menu(trigger, label, items, cls = "") {
  const d = h("details", { class: `menu ${cls}` });
  d.append(
    h("summary", { class: "menu-trigger", "aria-label": label, title: label }, trigger),
    h("div", { class: "menu-pop" }, items.map((it) =>
      h("button", {
        type: "button",
        class: `menu-item${it.danger ? " danger" : ""}`,
        disabled: it.disabled,
        onclick: () => {
          d.open = false;
          it.onClick();
        },
      }, it.icon && icon(it.icon), it.label))));
  return d;
}

// Borderless textarea that grows with its content
export function autoTextarea(attrs) {
  const el = h("textarea", { rows: 1, ...attrs });
  const fit = () => {
    el.style.height = "auto";
    // scrollHeight excludes the border; add it so bordered fields are not cut off
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };
  el.addEventListener("input", fit);
  requestAnimationFrame(fit);
  return el;
}

export function iconBtn(icon, label, disabled, onClick) {
  return h("button", { type: "button", class: "icon-btn", title: label, "aria-label": label, disabled, onclick: onClick }, icon);
}

export function linkBox(label, url, hint, warn) {
  const actions = [h("button", { type: "button", class: "btn", onclick: (e) => copyText(url, e.currentTarget) }, t("action.copy"))];
  if (navigator.share && !warn) {
    actions.push(h("button", { type: "button", class: "btn", onclick: () => navigator.share({ url }).catch(() => {}) }, t("action.share")));
  }
  return h("div", { class: `linkbox${warn ? " warn" : ""}` },
    h("span", { class: "field-label" }, label),
    h("div", { class: "linkbox-row" },
      h("input", { type: "text", readonly: true, value: url, onfocus: (e) => e.target.select() }),
      actions),
    hint && h("small", { class: "hint" }, hint));
}

export function errorCard(msg) {
  return h("section", { class: "card error-card" },
    h("p", {}, msg),
    h("a", { class: "btn", href: "./" }, t("action.home")));
}
