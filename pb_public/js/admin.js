// Admin page of a survey (a.html): status, favourite + "set final date", share link with QR code,
// participants / invitations and the full answer matrix.
import { h, params, hashParams, publicUrl, adminUrl, editUrl, saveMySurvey, removeMySurvey, toast, errorCard, icon, menu, copyText, setChildren } from "./util.js";
import { t, initI18n, onLangChange } from "./i18n.js";
import { api, errMsg, subscribe } from "./api.js";
import {
  statusPills, favoriteCard, scheduleMatrix, choiceMatrix, textOverview, commentsList, legend, exportCsv,
} from "./results.js";
import { initHeader, renderMineMenu } from "./header.js";
import { loadInvites, participantsCard, openInviteForm, pendingInvites } from "./invites.js";

const app = document.getElementById("app");
const id = params.get("id");
let key = hashParams.get("k") || "";

let data = null;
let showQr = false;
let answersOpen = true;

async function load() {
  data = await api.getSurvey(id, key ? { "X-Admin-Key": key } : {});
  if (!data.admin) throw Object.assign(new Error("err.forbidden"), { status: 403 });
  key = data.admin_key || key;
  await loadInvites(id, key);
  // Own surveys are listed via the account; remember links shared by others in this browser
  if (!data.owner) {
    saveMySurvey({ id, key, title: data.survey.title });
    renderMineMenu();
  }
}

const withFinal = (q) => ({ ...q, final: data.survey.final[q.id] });

function render() {
  const s = data.survey;
  const responses = data.responses;
  const pending = pendingInvites();
  const expected = responses.length + pending.length;
  document.title = `${s.title} · eventi`;
  const schedules = s.questions.filter((q) => q.type === "schedule");

  setChildren(app,
    headSection(s, pending.length ? t("admin.voted_of", { n: responses.length, total: expected }) : t("vote.participants", { n: responses.length })),
    responses.length > 0 && schedules.map((q) => favoriteCard(s, q, responses, {
      admin: true, total: expected, several: schedules.length > 1, onFinal, ringLabel: t("ov.responses"),
    })),
    linkCard(),
    participantsCard({ id, key, survey: s, responses, onChange: rerenderAnswers }),
    h("div", { id: "answers-slot" }, answersCard()));
}

// Only the answer matrix depends on the invitation list (pending rows)
function rerenderAnswers() {
  const slot = document.getElementById("answers-slot");
  if (slot) setChildren(slot, answersCard());
}

function headSection(s, progress) {
  return h("section", { class: "page-head" },
    h("div", { class: "head-row" },
      statusPills(s, progress),
      h("div", { class: "head-actions" },
        h("a", { class: "icon-pill", href: publicUrl(id), title: t("admin.view"), "aria-label": t("admin.view") }, icon("eye")),
        h("a", { class: "btn", href: editUrl(id, key) }, icon("edit"), t("admin.edit")),
        menu(icon("more"), t("action.more"), [
          { icon: s.is_closed ? "check" : "lock", label: t(s.is_closed ? "admin.reopen" : "admin.close"), onClick: toggleClosed },
          { icon: "download", label: t("admin.csv"), disabled: !data.count, onClick: () => exportCsv(s, data.responses) },
          { icon: "trash", label: t("admin.delete"), danger: true, onClick: deleteSurvey },
        ], "menu-boxed"))),
    h("h1", { class: "page-title" }, s.title),
    s.description && h("p", { class: "desc lead" }, s.description));
}

function linkCard() {
  const pub = publicUrl(id);
  const qrBox = h("div", { class: "qr" });
  if (showQr && window.qrcode) {
    const qr = window.qrcode(0, "M");
    qr.addData(pub);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true, alt: t("admin.qr") });
  }
  return h("section", { class: "card link-card" },
    h("div", { class: "link-row" },
      h("input", { type: "text", readonly: true, value: pub, "aria-label": t("success.public_link"), onfocus: (e) => e.target.select() }),
      h("button", { type: "button", class: "btn btn-primary", onclick: () => copyText(pub).then(() => toast(t("action.copied"))) }, icon("copy"), t("admin.copy_link")),
      h("button", {
        type: "button", class: `icon-pill${showQr ? " active" : ""}`, title: t("admin.qr"), "aria-label": t("admin.qr"), "aria-pressed": String(showQr),
        onclick: () => {
          showQr = !showQr;
          render();
        },
      }, icon("qr")),
      h("button", { type: "button", class: "btn", onclick: openInviteForm }, icon("mail"), t("invites.add"))),
    showQr && qrBox,
    h("div", { class: "link-foot" },
      h("span", { class: "muted small" }, icon("lock"), " ", t("admin.secret_hint")),
      h("button", { type: "button", class: "btn-link small", onclick: () => copyText(adminUrl(id, key)).then(() => toast(t("action.copied"))) }, t("action.copy"))));
}

function answersCard() {
  const s = data.survey;
  const responses = data.responses;
  const pendingNames = pendingInvites().map((i) => i.name || i.email);
  const several = s.questions.length > 1;
  const body = h("div", { class: "collapse-body" },
    !responses.length && !pendingNames.length && h("p", { class: "muted" }, t("results.empty")),
    (responses.length > 0 || pendingNames.length > 0) && s.questions.map((q) => {
      if (q.type === "text") return null;
      return h("div", { class: "all-block" },
        several && h("h3", { class: "q-title" }, q.label),
        q.type === "schedule"
          ? scheduleMatrix(withFinal(q), responses, { pending: pendingNames, onDelete: onDeleteResponse })
          : choiceMatrix(q, responses, { onDelete: onDeleteResponse }));
    }),
    responses.length > 0 && s.questions.some((q) => q.type === "schedule") && legend(s.questions.find((q) => q.type === "schedule")),
    responses.length > 0 && s.questions.filter((q) => q.type === "text").map((q) => textOverview(q, responses, q.label)),
    commentsList(responses));
  return h("section", { class: "card" },
    h("div", { class: "card-head" },
      h("h2", {}, t("all.title_plain")),
      h("button", {
        type: "button", class: "btn-link small muted-link", "aria-expanded": String(answersOpen),
        onclick: () => {
          answersOpen = !answersOpen;
          rerenderAnswers();
        },
      }, t(answersOpen ? "all.collapse" : "all.expand"), icon(answersOpen ? "up" : "down"))),
    answersOpen && body);
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
