/// <reference path="../pb_data/types.d.ts" />

// Locale (see GLOSSARY.md): the language and date conventions used for one recipient.
// The single server-side place for the language list, the default language, the language
// of a recipient and the date formats in emails. (The browser has its own i18n.js.)

const LANGS = ["de", "en", "fr"];

const DOW = {
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  fr: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
};
const ALL_DAY = { de: "ganztägig", en: "all day", fr: "toute la journée" };

const supported = (l) => LANGS.indexOf(l) >= 0;

// A supported language code or "" (for user input)
function cleanLang(l) {
  return supported(l) ? l : "";
}

// EVENTI_DEFAULT_LANG if supported, else German
function defaultLang() {
  const l = $os.getenv("EVENTI_DEFAULT_LANG");
  return supported(l) ? l : "de";
}

// Language of an account; without an own setting the fallback account's (e.g. the survey owner
// for an invited person), else the default language
function langOf(user, fallbackUser) {
  const own = user ? user.getString("lang") : "";
  if (supported(own)) return own;
  const fb = fallbackUser ? fallbackUser.getString("lang") : "";
  return supported(fb) ? fb : defaultLang();
}

const pad = (n) => (n < 10 ? "0" : "") + n;
// "2026-12-05" in the language's date order: 05.12.2026 / 2026-12-05
const fmtDay = (lang, y, m, d) => (lang === "en" ? y + "-" + pad(m) + "-" + pad(d) : pad(d) + "." + pad(m) + "." + y);

// Slot "2026-12-05T18:00" -> "Sa 05.12.2026, 18:00" / "Sat 2026-12-05, 18:00" ("…, ganztägig" without time)
function fmtSlot(lang, slot) {
  if (!supported(lang)) lang = defaultLang();
  const p = slot.split("T");
  const ymd = p[0].split("-").map(Number);
  const dow = DOW[lang][new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2])).getUTCDay()];
  return dow + " " + fmtDay(lang, ymd[0], ymd[1], ymd[2]) + ", " + (p[1] || ALL_DAY[lang]);
}

// Point in time (ISO or PocketBase date) in the container's time zone (TZ) -> "Sa 05.12.2026, 18:00"
function fmtDateTime(lang, iso) {
  if (!supported(lang)) lang = defaultLang();
  const d = new Date(String(iso).replace(" ", "T"));
  return DOW[lang][d.getDay()] + " " + fmtDay(lang, d.getFullYear(), d.getMonth() + 1, d.getDate()) + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

module.exports = { LANGS, cleanLang, defaultLang, langOf, fmtSlot, fmtDateTime };
