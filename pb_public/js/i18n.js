const SUPPORTED = ["de", "en", "fr"];
const LANG_KEY = "eventi:lang";

let lang = "de";
let dict = {};
let config = {};
const listeners = [];

export const currentLang = () => lang;
export const has = (key) => key in dict;
// Server config from /api/eventi/config (mail, signup, ...), loaded by initI18n()
export const appConfig = () => config;

export function t(key, vars) {
  let s = dict[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

// Plural via "<key>_one" / "<key>_other"
export const tn = (key, n) => t(`${key}_${n === 1 ? "one" : "other"}`, { n });

export function onLangChange(fn) {
  listeners.push(fn);
}

export async function setLang(l) {
  if (!SUPPORTED.includes(l)) l = "de";
  // no-cache: always revalidate, so stale translations never outlive an update
  const res = await fetch(`i18n/${l}.json`, { cache: "no-cache" });
  dict = await res.json();
  lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* storage unavailable */ }
  const sel = document.getElementById("lang");
  if (sel) sel.value = l;
  listeners.forEach((fn) => fn());
}

export async function initI18n() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch { /* storage unavailable */ }
  const browser = (navigator.languages || [navigator.language || "de"])
    .map((x) => x.slice(0, 2).toLowerCase())
    .find((x) => SUPPORTED.includes(x));
  config = await fetch("/api/eventi/config").then((r) => r.json()).catch(() => ({}));
  const sel = document.getElementById("lang");
  if (sel) sel.addEventListener("change", () => setLang(sel.value));
  await setLang(saved || browser || config.default_lang || "de");
}

// Slots are "YYYY-MM-DD" (all day) or "YYYY-MM-DDTHH:MM", local time without zone.
export function parseSlot(slot) {
  const [d, tm] = slot.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = (tm || "00:00").split(":").map(Number);
  return { date: new Date(y, m - 1, day, hh, mm), allDay: !tm };
}

export const fmtDate = (date, opts) => new Intl.DateTimeFormat(lang, opts).format(date);
export const fmtTime = (date) => fmtDate(date, { hour: "numeric", minute: "2-digit" });

export function slotParts(slot, long = false) {
  const { date, allDay } = parseSlot(slot);
  return {
    day: fmtDate(date, { weekday: long ? "long" : "short", day: "numeric", month: long ? "long" : "short" }),
    time: allDay ? t("slot.allday") : fmtTime(date),
  };
}

export function fmtSlot(slot, long = false) {
  const p = slotParts(slot, long);
  return `${p.day}, ${p.time}`;
}
