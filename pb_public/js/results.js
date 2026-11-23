import { h, download, slug, publicUrl } from "./util.js";
import { t, fmtDate, fmtSlot, slotParts, parseSlot } from "./i18n.js";

export const ICON = { yes: "✓", maybe: "?", no: "✕" };

export function slotLabel(slot) {
  const p = slotParts(slot);
  return h("div", { class: "slot-label" }, h("strong", {}, p.day), h("span", {}, p.time));
}

export function renderResults(el, survey, responses, opts = {}) {
  el.replaceChildren();
  if (!responses.length) {
    el.append(h("section", { class: "card" }, h("p", { class: "muted" }, t("results.empty"))));
    return;
  }
  for (const q of survey.questions) {
    const card = h("section", { class: "card" }, h("h3", { class: "q-title" }, q.label));
    if (q.type === "choice") card.append(choiceResults(q, responses));
    else if (q.type === "schedule") card.append(...scheduleResults(q, responses, survey, opts));
    else card.append(textResults(q, responses));
    el.append(card);
  }
  if (opts.admin) el.append(participants(responses, opts));
}

function choiceResults(q, responses) {
  const names = Object.fromEntries(q.options.map((o) => [o, []]));
  for (const r of responses) for (const o of r.answers[q.id] || []) names[o]?.push(r.name);
  const total = responses.length;
  const max = Math.max(...q.options.map((o) => names[o].length));
  return h("div", { class: "bars" }, q.options.map((o) => {
    const n = names[o].length;
    return h("div", { class: `bar-row${n === max && n > 0 ? " is-top" : ""}`, title: names[o].join(", ") },
      h("div", { class: "bar-label" }, h("span", {}, o), h("span", { class: "bar-count" }, `${n} · ${Math.round((n / total) * 100)}%`)),
      h("div", { class: "bar" }, h("span", { style: `width:${(n / total) * 100}%` })));
  }));
}

function scheduleResults(q, responses, survey, opts) {
  const stats = q.slots.map((slot) => {
    const yes = [], maybe = [];
    for (const r of responses) {
      const v = r.answers[q.id]?.[slot];
      if (v === "yes") yes.push(r.name);
      else if (v === "maybe") maybe.push(r.name);
    }
    return { slot, yes, maybe };
  });
  // Best = most "yes", ties broken by most "maybe"
  const best = stats.reduce((b, s) => (!b || s.yes.length > b.yes.length || (s.yes.length === b.yes.length && s.maybe.length > b.maybe.length) ? s : b), null);
  const isBest = (s) => best.yes.length + best.maybe.length > 0 && s.yes.length === best.yes.length && s.maybe.length === best.maybe.length;
  const total = responses.length;
  const fin = survey.final[q.id];

  const names = (list, cls) => list.length ? h("p", { class: "names" }, h("span", { class: `dot dot-${cls}` }), list.join(", ")) : null;

  const list = h("div", { class: "slot-results" }, stats.map((s) =>
    h("details", { class: `slot-res${isBest(s) ? " best" : ""}${fin === s.slot ? " is-final" : ""}` },
      h("summary", {},
        slotLabel(s.slot),
        h("span", { class: "slot-count" },
          isBest(s) && h("span", { class: "star", title: t("results.best") }, "★"),
          h("b", { class: "c-yes" }, `${ICON.yes} ${s.yes.length}`),
          q.maybe && h("b", { class: "c-maybe" }, `${ICON.maybe} ${s.maybe.length}`)),
        h("div", { class: "stack", "aria-hidden": "true" },
          h("span", { class: "stack-yes", style: `width:${(s.yes.length / total) * 100}%` }),
          h("span", { class: "stack-maybe", style: `width:${(s.maybe.length / total) * 100}%` })),
        (fin === s.slot || opts.admin) && h("div", { class: "slot-actions" },
          fin === s.slot && h("span", { class: "pill pill-final" }, t("final.badge")),
          opts.admin && h("button", {
            type: "button",
            class: "btn btn-sm",
            onclick: (e) => { e.preventDefault(); opts.onFinal(q.id, s.slot); },
          }, t(fin === s.slot ? "final.unset" : "final.set")))),
      h("div", { class: "slot-names" },
        names(s.yes, "yes"),
        names(s.maybe, "maybe"),
        !s.yes.length && !s.maybe.length && h("p", { class: "muted small" }, t("results.nobody"))))));

  return [list, matrix(q, responses, stats, opts)];
}

function matrix(q, responses, stats, opts) {
  const table = h("table", { class: "matrix" },
    h("thead", {}, h("tr", {},
      h("th", {}, ""),
      q.slots.map((sl) => {
        const p = slotParts(sl);
        return h("th", { scope: "col" }, h("span", {}, p.day), h("small", {}, p.time));
      }))),
    h("tbody", {}, responses.map((r) =>
      h("tr", { class: r.id === opts.mineId ? "mine" : null },
        h("th", { scope: "row" }, r.name),
        q.slots.map((sl) => {
          const v = r.answers[q.id]?.[sl] || "no";
          return h("td", { class: `cell-${v}`, title: t(`answer.${v}`) }, ICON[v]);
        })))),
    h("tfoot", {}, h("tr", {},
      h("th", { scope: "row" }, ICON.yes),
      stats.map((s) => h("td", {}, String(s.yes.length))))));
  return h("details", { class: "matrix-wrap" }, h("summary", {}, t("results.table")), h("div", { class: "table-scroll" }, table));
}

function textResults(q, responses) {
  const items = responses.filter((r) => r.answers[q.id]);
  if (!items.length) return h("p", { class: "muted" }, t("results.no_text"));
  return h("div", { class: "texts" }, items.map((r) =>
    h("blockquote", {}, h("p", {}, r.answers[q.id]), h("cite", {}, r.name))));
}

function participants(responses, opts) {
  return h("section", { class: "card" },
    h("h3", {}, t("admin.participants", { n: responses.length })),
    h("ul", { class: "plist" }, responses.map((r) =>
      h("li", {},
        h("span", { class: "plist-name" }, r.name),
        h("span", { class: "muted small" }, fmtDate(new Date(r.created), { dateStyle: "short", timeStyle: "short" })),
        h("button", {
          type: "button",
          class: "icon-btn",
          title: t("action.remove"),
          "aria-label": `${t("action.remove")}: ${r.name}`,
          onclick: () => opts.onDeleteResponse(r),
        }, "✕")))));
}

export function finalBanner(survey) {
  const qs = survey.questions.filter((q) => q.type === "schedule" && survey.final[q.id]);
  if (!qs.length) return document.createDocumentFragment();
  const several = survey.questions.filter((q) => q.type === "schedule").length > 1;
  return h("section", { class: "card final" }, qs.map((q) =>
    h("div", { class: "final-row" },
      h("div", {},
        h("p", { class: "eyebrow" }, `📅 ${t("final.title")}`),
        h("strong", { class: "final-date" }, fmtSlot(survey.final[q.id], true)),
        several && h("span", { class: "muted small" }, q.label)),
      h("button", {
        type: "button",
        class: "btn",
        onclick: () => download(`${slug(survey.title)}.ics`, ics(survey, survey.final[q.id]), "text/calendar;charset=utf-8"),
      }, t("final.ics")))));
}

const pad = (n) => String(n).padStart(2, "0");
const icsLocal = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsDay = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsEscape = (v) => v.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");

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
