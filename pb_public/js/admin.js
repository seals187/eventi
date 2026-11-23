import { h, params, hashParams, publicUrl, adminUrl, editUrl, saveMySurvey, removeMySurvey, linkBox, toast, download, slug, errorCard } from "./util.js";
import { t, initI18n, onLangChange, currentLang, fmtDate, fmtSlot } from "./i18n.js";
import { api, errMsg, subscribe } from "./api.js";
import { renderResults, finalBanner } from "./results.js";
import { initHeader, renderMineMenu } from "./header.js";

const app = document.getElementById("app");
const id = params.get("id");
let key = hashParams.get("k") || "";

let data = null;

async function load() {
  data = await api.getSurvey(id, key ? { "X-Admin-Key": key } : {});
  if (!data.admin) throw Object.assign(new Error("err.forbidden"), { status: 403 });
  key = data.admin_key || key;
  // Own surveys are listed via the account; remember links shared by others in this browser
  if (!data.owner) {
    saveMySurvey({ id, key, title: data.survey.title });
    renderMineMenu();
  }
}

function render() {
  const s = data.survey;
  document.title = `${s.title} · eventi`;
  const resultsBox = h("div");
  app.replaceChildren(
    h("section", { class: "card" },
      h("p", { class: "eyebrow" }, t("admin.eyebrow")),
      h("h1", {}, s.title),
      s.description && h("p", { class: "desc" }, s.description),
      h("div", { class: "meta" },
        h("span", { class: "pill" }, t("vote.participants", { n: data.count })),
        s.is_closed
          ? h("span", { class: "pill pill-closed" }, t("status.closed"))
          : h("span", { class: "pill pill-open" }, t("status.open")),
        !s.is_closed && s.closes_at && h("span", { class: "pill" }, t("status.closes", { date: fmtDate(new Date(s.closes_at), { dateStyle: "medium", timeStyle: "short" }) }))),
      linkBox(t("success.public_link"), publicUrl(id), t("success.public_hint")),
      linkBox(t("success.admin_link"), adminUrl(id, key), t("success.admin_hint"), true),
      h("div", { class: "btn-row" },
        h("a", { class: "btn", href: publicUrl(id) }, t("admin.view")),
        h("a", { class: "btn", href: editUrl(id, key) }, t("admin.edit")),
        h("button", { type: "button", class: "btn", onclick: toggleClosed }, t(s.is_closed ? "admin.reopen" : "admin.close")),
        h("button", { type: "button", class: "btn", onclick: exportCsv, disabled: !data.count }, t("admin.csv")),
        h("button", { type: "button", class: "btn btn-ghost danger", onclick: deleteSurvey }, t("admin.delete")))),
    finalBanner(s),
    h("h2", { class: "section-title" }, t("results.title")),
    resultsBox);
  renderResults(resultsBox, s, data.responses, { admin: true, onFinal, onDeleteResponse });
}

async function patch(body) {
  try {
    await api.updateSurvey(id, key, body);
    await load();
    render();
    toast(t("admin.saved"));
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

function toggleClosed() {
  const s = data.survey;
  if (!s.is_closed) return patch({ closed: true });
  const expired = s.closes_at && new Date(s.closes_at) <= new Date();
  return patch(expired ? { closed: false, closes_at: "" } : { closed: false });
}

function onFinal(qid, slot) {
  const final = { ...data.survey.final };
  if (final[qid] === slot) delete final[qid];
  else final[qid] = slot;
  patch({ final });
}

async function onDeleteResponse(r) {
  if (!confirm(t("admin.delete_response_confirm", { name: r.name }))) return;
  try {
    await api.deleteVote(r.id, { "X-Admin-Key": key });
    await load();
    render();
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

async function deleteSurvey() {
  if (!confirm(t("admin.delete_confirm"))) return;
  try {
    await api.deleteSurvey(id, key);
    removeMySurvey(id);
    location.href = "./";
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

function exportCsv() {
  const s = data.survey;
  const sep = currentLang() === "en" ? "," : ";";
  const head = [t("vote.name"), t("csv.date")];
  for (const q of s.questions) {
    if (q.type === "schedule") for (const sl of q.slots) head.push(`${q.label} – ${fmtSlot(sl)}`);
    else head.push(q.label);
  }
  const rows = data.responses.map((r) => {
    const row = [r.name, r.created];
    for (const q of s.questions) {
      const a = r.answers[q.id];
      if (q.type === "schedule") for (const sl of q.slots) row.push(t(`answer.${a?.[sl] || "no"}`));
      else if (q.type === "choice") row.push((a || []).join(", "));
      else row.push(a || "");
    }
    return row;
  });
  // Quote when needed and neutralize spreadsheet formulas
  const esc = (v) => {
    v = String(v ?? "");
    if (/^[=+\-@]/.test(v)) v = `'${v}`;
    return /["\n\r,;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const csv = `﻿${[head, ...rows].map((r) => r.map(esc).join(sep)).join("\r\n")}`;
  download(`${slug(s.title)}.csv`, csv, "text/csv;charset=utf-8");
}

async function main() {
  await initI18n();
  await initHeader();
  if (!id) {
    app.replaceChildren(errorCard(t("err.not_found")));
    return;
  }
  try {
    await load();
  } catch (e) {
    app.replaceChildren(errorCard(errMsg(e)));
    return;
  }
  render();
  onLangChange(render);
  subscribe(id, async () => {
    try {
      await load();
      render();
    } catch { /* survey deleted elsewhere */ }
  });
}

main();
