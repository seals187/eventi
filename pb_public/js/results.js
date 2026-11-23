// Shared result components for the voting page (s.html) and the admin page (a.html):
// status pills, favourite card with ring, group bars, answer matrix, comments, CSV and .ics.
import { h, download, slug, publicUrl, icon } from "./util.js";
import { t, fmtDate, fmtSlot, slotParts, parseSlot, currentLang } from "./i18n.js";

export const ICON = { yes: "✓", maybe: "?", no: "✕" };

// "Jane Doe" -> "JD", "JK" -> "JK", "anna" -> "A"
export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  // Short all-caps names stay as they are ("JK"), otherwise first letters
  const one = parts[0] || "?";
  const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (one.length <= 3 && one === one.toUpperCase() ? one : one[0]);
  return s.toUpperCase();
}

export const avatar = (name, cls = "") => h("span", { class: `avatar ${cls}`, "aria-hidden": "true" }, initials(name));

const shortDateTime = (iso) => fmtDate(new Date(iso), { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

// --- statistics ----------------------------------------------------------------

// Per slot: names that answered yes / maybe / no (no = everyone else)
export function slotStats(q, responses) {
  return q.slots.map((slot) => {
    const s = { slot, yes: [], maybe: [], no: [] };
    for (const r of responses) {
      const v = r.answers[q.id]?.[slot];
      (v === "yes" ? s.yes : v === "maybe" ? s.maybe : s.no).push(r.name);
    }
    return s;
  });
}

// Best slot: most "yes", ties broken by most "maybe"; -1 if nobody can
export function bestIndex(stats) {
  let best = -1;
  stats.forEach((s, i) => {
    if (!s.yes.length && !s.maybe.length) return;
    const b = stats[best];
    if (!b || s.yes.length > b.yes.length || (s.yes.length === b.yes.length && s.maybe.length > b.maybe.length)) best = i;
  });
  return best;
}

// --- small building blocks -------------------------------------------------------

export function statusPills(survey, extra) {
  return h("div", { class: "meta" },
    survey.is_closed
      ? h("span", { class: "pill pill-closed" }, h("span", { class: "pill-dot" }), t("status.closed"))
      : h("span", { class: "pill pill-open" }, h("span", { class: "pill-dot" }), t("status.open")),
    extra && h("span", { class: "pill" }, extra),
    !survey.is_closed && survey.closes_at && h("span", { class: "pill" },
      t("status.closes", { date: fmtDate(new Date(survey.closes_at), { dateStyle: "medium", timeStyle: "short" }) })));
}

// Progress ring "4/5"
export function ring(n, total, label) {
  const r = 26, c = 2 * Math.PI * r;
  const part = total ? Math.min(n / total, 1) : 0;
  const svg = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="ring-bg"/>` +
    `<circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${c * part} ${c}" transform="rotate(-90 32 32)"/></svg>`;
  const el = h("div", { class: "ring", role: "img", "aria-label": `${n}/${total}` });
  el.innerHTML = svg;
  el.append(h("div", { class: "ring-text" }, h("strong", {}, `${n}/${total}`), label && h("small", {}, label)));
  return el;
}

// Stacked yes / maybe / no bar
export function groupBar(s, total) {
  const w = (n) => `width:${total ? (n / total) * 100 : 0}%`;
  return h("div", { class: "gbar", "aria-hidden": "true" },
    s.yes.length > 0 && h("span", { class: "g-yes", style: w(s.yes.length) }),
    s.maybe.length > 0 && h("span", { class: "g-maybe", style: w(s.maybe.length) }),
    s.no.length > 0 && h("span", { class: "g-no", style: w(s.no.length) }));
}

export const votePill = (v) => h("span", { class: `vpill vpill-${v}` }, ICON[v], " ", t(`answer.${v}`));

function slotName(slot) {
  const p = slotParts(slot);
  return h("div", { class: "slot-name" }, h("strong", {}, p.day), h("span", {}, p.time));
}

export function legend(q) {
  const states = q && !q.maybe ? ["yes", "no"] : ["yes", "maybe", "no"];
  return h("div", { class: "legend-chips" }, states.map(votePill));
}

// --- favourite / final -----------------------------------------------------------

// "Favourite so far: Fri, 27 Nov – all day · all 4 can make it" with ring.
// Admin variant shows "Termin festlegen" (opts.onFinal).
export function favoriteCard(survey, q, responses, opts = {}) {
  const fin = survey.final[q.id];
  const stats = slotStats(q, responses);
  const total = opts.total ?? responses.length;
  if (fin) {
    const s = stats.find((x) => x.slot === fin) || { yes: [], maybe: [] };
    return h("section", { class: "card fav fav-final" },
      ring(s.yes.length, total, opts.ringLabel),
      h("div", { class: "fav-main" },
        h("p", { class: "eyebrow" }, t("final.title")),
        h("strong", { class: "fav-date" }, fmtSlot(fin, true)),
        opts.several && h("span", { class: "muted small" }, q.label)),
      h("div", { class: "fav-actions" },
        h("button", { type: "button", class: "btn", onclick: () => downloadIcs(survey, fin) }, icon("calendar"), t("final.ics")),
        opts.onFinal && h("button", { type: "button", class: "btn btn-ghost", onclick: () => opts.onFinal(q.id, fin) }, t("final.unset"))));
  }
  const bi = bestIndex(stats);
  if (bi < 0) return null;
  const s = stats[bi];
  const p = slotParts(s.slot, true);
  const can = s.yes.length === responses.length ? t("ov.all_can", { n: s.yes.length }) : t("ov.n_can", { n: s.yes.length, total: responses.length });
  return h("section", { class: "card fav" },
    opts.admin && ring(responses.length, total, t("ov.responses")),
    h("div", { class: "fav-main" },
      h("p", { class: "eyebrow" }, t(opts.admin ? "ov.favorite_admin" : "ov.favorite"), opts.several && ` · ${q.label}`),
      h("strong", { class: "fav-date" }, p.day),
      h("span", { class: "muted" }, `${p.time} · ${can}`, s.maybe.length > 0 ? ` · ${t("ov.n_maybe", { n: s.maybe.length })}` : "")),
    opts.onFinal
      ? h("button", { type: "button", class: "btn btn-yes", onclick: () => opts.onFinal(q.id, s.slot) }, t("ov.set_final"))
      : ring(s.yes.length, responses.length));
}

// --- overview (voting page) ------------------------------------------------------

export function scheduleOverview(q, responses, mine, title) {
  const stats = slotStats(q, responses);
  const total = responses.length;
  const counts = (s) => q.maybe
    ? t("ov.counts", { y: s.yes.length, m: s.maybe.length, n: s.no.length })
    : t("ov.counts_nomaybe", { y: s.yes.length, n: s.no.length });
  const fin = q.final;
  return h("div", { class: "ov-table" },
    title && h("h3", { class: "q-title" }, title),
    h("div", { class: "ov-head" },
      h("span", {}, t("ov.slot")), h("span", {}, t("ov.group")), h("span", { class: "ov-me" }, mine ? t("ov.your_vote") : "")),
    stats.map((s) => {
      const v = mine ? mine.answers[q.id]?.[s.slot] || "no" : null;
      return h("div", { class: `ov-row${fin === s.slot ? " is-final" : ""}` },
        slotName(s.slot),
        h("div", { class: "ov-group" }, groupBar(s, total), h("small", {}, counts(s))),
        h("div", { class: "ov-me" }, v && votePill(v)));
    }));
}

export function choiceOverview(q, responses, mine, title) {
  const total = responses.length;
  const mineSel = mine?.answers[q.id] || [];
  const counts = q.options.map((o) => responses.filter((r) => (r.answers[q.id] || []).includes(o)).length);
  const max = Math.max(0, ...counts);
  return h("div", { class: "ov-table" },
    h("h3", { class: "q-title" }, title),
    h("div", { class: "bars" }, q.options.map((o, i) =>
      h("div", { class: `bar-row${counts[i] === max && max > 0 ? " is-top" : ""}` },
        h("div", { class: "bar-label" },
          h("span", {}, o, mineSel.includes(o) && h("span", { class: "vpill vpill-yes vpill-sm" }, ICON.yes)),
          h("span", { class: "bar-count" }, `${counts[i]} · ${total ? Math.round((counts[i] / total) * 100) : 0}%`)),
        h("div", { class: "bar" }, h("span", { style: `width:${total ? (counts[i] / total) * 100 : 0}%` }))))));
}

export function textOverview(q, responses, title) {
  const items = responses.filter((r) => r.answers[q.id]);
  return h("div", { class: "ov-table" },
    h("h3", { class: "q-title" }, title),
    items.length
      ? h("ul", { class: "comments" }, items.map((r) => commentItem(r.name, r.created, r.answers[q.id])))
      : h("p", { class: "muted" }, t("results.no_text")));
}

// --- all answers (matrix) --------------------------------------------------------

// opts: { mineId, pending: [names], onDelete(r), sort: "name"|"date" }
export function scheduleMatrix(q, responses, opts = {}) {
  const stats = slotStats(q, responses);
  const bi = bestIndex(stats);
  const fin = q.final;
  const total = responses.length;
  const colCls = (i) => (fin ? (q.slots[i] === fin ? " col-best" : "") : (i === bi ? " col-best" : ""));
  const cell = (v) => h("td", { class: "mcell" }, h("span", { class: `mc mc-${v}`, title: t(`answer.${v}`) }, ICON[v]));

  return h("div", { class: "table-scroll plain" }, h("table", { class: "matrix2" },
    h("thead", {}, h("tr", {},
      h("th", {}, ""),
      q.slots.map((sl, i) => {
        const { date, allDay } = parseSlot(sl);
        return h("th", { scope: "col", class: `mhead${colCls(i)}` },
          h("small", {}, fmtDate(date, { weekday: "short" })),
          h("strong", {}, fmtDate(date, { day: "numeric", month: "short" })),
          h("small", {}, allDay ? t("slot.allday") : fmtDate(date, { hour: "2-digit", minute: "2-digit" })));
      }))),
    h("tbody", {},
      responses.map((r) => {
        const me = r.id === opts.mineId;
        return h("tr", { class: me ? "me-row" : null },
          h("th", { scope: "row" }, personCell(r, me, opts)),
          q.slots.map((sl, i) => {
            const td = cell(r.answers[q.id]?.[sl] || "no");
            td.className += colCls(i);
            return td;
          }));
      }),
      (opts.pending || []).map((name) => h("tr", { class: "pending-row" },
        h("th", { scope: "row" }, h("div", { class: "person" }, avatar(name, "avatar-muted"),
          h("div", {}, h("span", { class: "muted" }, `${name} · ${t("all.pending")}`)))),
        q.slots.map((_, i) => h("td", { class: `mcell${colCls(i)}` }, h("span", { class: "muted" }, "–")))))),
    h("tfoot", {}, h("tr", {},
      h("th", { scope: "row" }, t("all.yes_total")),
      stats.map((s, i) => h("td", { class: `mfoot${colCls(i)}` },
        h("span", { class: "mfoot-n" }, h("strong", { class: i === bi ? "c-yes" : "" }, String(s.yes.length)), ` / ${total}`),
        groupBar(s, total)))))));
}

export function choiceMatrix(q, responses, opts = {}) {
  return h("div", { class: "table-scroll plain" }, h("table", { class: "matrix2" },
    h("thead", {}, h("tr", {}, h("th", {}, ""), q.options.map((o) => h("th", { scope: "col", class: "mhead" }, h("strong", {}, o))))),
    h("tbody", {}, responses.map((r) => {
      const sel = r.answers[q.id] || [];
      return h("tr", { class: r.id === opts.mineId ? "me-row" : null },
        h("th", { scope: "row" }, personCell(r, r.id === opts.mineId, opts)),
        q.options.map((o) => h("td", { class: "mcell" }, sel.includes(o)
          ? h("span", { class: "mc mc-yes" }, ICON.yes)
          : h("span", { class: "muted" }, "–"))));
    }))));
}

function personCell(r, me, opts) {
  return h("div", { class: "person" },
    avatar(r.name, me ? "avatar-me" : ""),
    h("div", {},
      h("span", { class: "person-name" }, r.name,
        me && h("span", { class: "du-badge" }, t("all.you")),
        r.account && h("span", { class: "acct-badge", title: t("results.account"), "aria-label": t("results.account") }, icon("user"))),
      h("small", {}, shortDateTime(r.created))),
    opts.onDelete && h("button", {
      type: "button", class: "row-del", title: t("action.remove"), "aria-label": `${t("action.remove")}: ${r.name}`,
      onclick: () => opts.onDelete(r),
    }, icon("trash")));
}

export function sortResponses(responses, by) {
  const list = [...responses];
  if (by === "name") list.sort((a, b) => a.name.localeCompare(b.name, currentLang(), { sensitivity: "base" }));
  return list;
}

// --- comments --------------------------------------------------------------------

function commentItem(name, created, text) {
  return h("li", {},
    avatar(name),
    h("div", {},
      h("p", { class: "comment-head" }, h("strong", {}, name), h("span", { class: "muted" }, ` · ${shortDateTime(created)}`)),
      h("p", { class: "comment-text" }, text)));
}

export function commentsList(responses) {
  const items = responses.filter((r) => r.comment);
  if (!items.length) return null;
  return h("div", { class: "comments-wrap" },
    h("h3", {}, t("all.comments")),
    h("ul", { class: "comments" }, items.map((r) => commentItem(r.name, r.created, r.comment))));
}

// --- final date (.ics) -----------------------------------------------------------

export function finalBanner(survey) {
  const qs = survey.questions.filter((q) => q.type === "schedule" && survey.final[q.id]);
  if (!qs.length) return null;
  const several = survey.questions.filter((q) => q.type === "schedule").length > 1;
  return h("section", { class: "card final" }, qs.map((q) =>
    h("div", { class: "final-row" },
      h("div", {},
        h("p", { class: "eyebrow" }, t("final.title")),
        h("strong", { class: "final-date" }, fmtSlot(survey.final[q.id], true)),
        several && h("span", { class: "muted small" }, q.label)),
      h("button", { type: "button", class: "btn", onclick: () => downloadIcs(survey, survey.final[q.id]) }, icon("calendar"), t("final.ics")))));
}

const pad = (n) => String(n).padStart(2, "0");
const icsLocal = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsDay = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsEscape = (v) => v.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");

function downloadIcs(survey, slot) {
  download(`${slug(survey.title)}.ics`, ics(survey, slot), "text/calendar;charset=utf-8");
}

function ics(survey, slot) {
  const { date, allDay } = parseSlot(slot);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//eventi//EN", "BEGIN:VEVENT",
    `UID:${survey.id}-${icsDay(date)}@eventi`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`];
  if (allDay) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${icsDay(date)}`, `DTEND;VALUE=DATE:${icsDay(next)}`);
  } else {
    lines.push(`DTSTART:${icsLocal(date)}`, `DTEND:${icsLocal(new Date(date.getTime() + 2 * 3600e3))}`);
  }
  lines.push(`SUMMARY:${icsEscape(survey.title)}`);
  if (survey.description) lines.push(`DESCRIPTION:${icsEscape(survey.description)}`);
  lines.push(`URL:${publicUrl(survey.id)}`, "END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

// --- CSV -------------------------------------------------------------------------

export function exportCsv(survey, responses) {
  const sep = currentLang() === "en" ? "," : ";";
  const head = [t("vote.name"), t("csv.date")];
  for (const q of survey.questions) {
    if (q.type === "schedule") for (const sl of q.slots) head.push(`${q.label} – ${fmtSlot(sl)}`);
    else head.push(q.label);
  }
  head.push(t("mine.comment"));
  const rows = responses.map((r) => {
    const row = [r.name, r.created];
    for (const q of survey.questions) {
      const a = r.answers[q.id];
      if (q.type === "schedule") for (const sl of q.slots) row.push(t(`answer.${a?.[sl] || "no"}`));
      else if (q.type === "choice") row.push((a || []).join(", "));
      else row.push(a || "");
    }
    row.push(r.comment || "");
    return row;
  });
  // Quote when needed and neutralize spreadsheet formulas
  const esc = (v) => {
    v = String(v ?? "");
    if (/^[=+\-@]/.test(v)) v = `'${v}`;
    return /["\n\r,;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const csv = `﻿${[head, ...rows].map((r) => r.map(esc).join(sep)).join("\r\n")}`;
  download(`${slug(survey.title)}.csv`, csv, "text/csv;charset=utf-8");
}
