// Voting page (s.html): tabs "Overview", "My answer" and "All answers".
// Who the participant is and what they may do comes from the server (data.participant);
// credentials.js keeps the participant's credentials in this browser.
import { h, store, params, toast, errorCard, setChildren, autoTextarea } from "./util.js";
import { t, initI18n, onLangChange, fmtDate, slotParts } from "./i18n.js";
import { surveyClient, errMsg, subscribe } from "./api.js";
import {
  ICON, avatar, statusPills, favoriteCard, scheduleOverview, choiceOverview, textOverview,
  scheduleMatrix, choiceMatrix, commentsList, legend, sortResponses, exportCsv, finalBanner,
} from "./results.js";
import { initHeader, loginUrl } from "./header.js";
import { surveyCredentials } from "./credentials.js";
import { limit } from "./rules.js";

const app = document.getElementById("app");
const id = params.get("id");
const NAME_KEY = "eventi:name";
const creds = surveyCredentials(id);
const client = surveyClient(id, { credentials: creds });

let data = null;
let draft = null;               // { name, answers, comment } being edited
let dirty = false;
// Active tab: "overview" | "mine" | "all" (deep link: s.html?id=…&tab=all)
let tab = ["overview", "mine", "all"].includes(params.get("tab")) ? params.get("tab") : null;
let sortBy = "date";
const els = {};

async function load() {
  data = await client.load();
  creds.sync(data);
}

function initDraft() {
  const who = data.participant;
  draft = data.mine
    ? { name: data.mine.name, answers: structuredClone(data.mine.answers), comment: data.mine.comment || "" }
    : { name: who.name_fixed ? who.name : who.name || store.get(NAME_KEY) || "", answers: {}, comment: "" };
  for (const q of data.survey.questions) {
    if (q.type !== "schedule") continue;
    if (!draft.answers[q.id]) draft.answers[q.id] = {};
    // The server only stores yes/maybe. In an existing answer, every other slot was a "no";
    // in a new answer, slots stay unselected until clicked (and still count as "no").
    if (data.mine) for (const slot of q.slots) draft.answers[q.id][slot] ||= "no";
  }
  dirty = false;
}

const withFinal = (q) => ({ ...q, final: data.survey.final[q.id] });
const canChange = () => (data.mine ? data.participant.can_edit : data.participant.can_respond);
const needsLogin = () => data.participant.must_login && !data.mine;

// --- layout ------------------------------------------------------------------------

function render() {
  const s = data.survey;
  document.title = `${s.title} · eventi`;
  app.classList.add("compact");
  if (!tab) tab = data.mine || s.is_closed ? "overview" : "mine";
  els.head = h("div", { class: "page-head" });
  els.tabs = h("div", { class: "tabs", role: "tablist" });
  els.body = h("div", { class: "tab-body" });
  app.replaceChildren(els.head, els.tabs, els.body);
  renderHead();
  renderTabs();
  renderBody();
}

function renderHead() {
  const s = data.survey;
  setChildren(els.head,
    statusPills(s, t("vote.participants", { n: data.count })),
    h("h1", { class: "page-title" }, s.title),
    s.description && h("p", { class: "desc lead" }, s.description));
}

function renderTabs() {
  const item = (key, label) => h("button", {
    type: "button", role: "tab", class: "tab", "aria-selected": String(tab === key),
    onclick: () => switchTab(key),
  }, label);
  setChildren(els.tabs, item("overview", t("tabs.overview")), item("mine", t("tabs.mine")), item("all", t("tabs.all")));
}

function switchTab(key) {
  if (tab === "mine" && key !== "mine" && dirty && !confirm(t("vote.discard"))) return;
  if (key === "mine") initDraft();
  tab = key;
  renderTabs();
  renderBody();
}

function renderBody() {
  if (tab === "mine") renderMine();
  else if (tab === "all") renderAll();
  else renderOverview();
}

// --- overview ------------------------------------------------------------------------

function hiddenResults() {
  const key = data.survey.settings.results === "after_vote" ? "results.after_vote" : "results.hidden";
  return h("section", { class: "card" }, h("p", { class: "muted" }, t(key)));
}

function votedFooter() {
  const s = data.survey;
  if (data.mine) {
    return h("div", { class: "card-foot" },
      h("span", { class: "muted small" }, t("ov.voted_as", { name: data.mine.name, date: fmtDate(new Date(data.mine.created), { dateStyle: "short", timeStyle: "short" }) })),
      canChange() && h("button", { type: "button", class: "btn", onclick: () => switchTab("mine") }, t("vote.edit")));
  }
  if (s.is_closed) return h("div", { class: "card-foot" }, h("span", { class: "muted small" }, t("vote.closed_info")));
  return h("div", { class: "card-foot" },
    h("span", { class: "muted small" }, t("ov.not_voted")),
    h("button", { type: "button", class: "btn btn-primary", onclick: () => switchTab("mine") }, t("ov.vote_now")));
}

function renderOverview() {
  const s = data.survey;
  const out = [];
  const banner = finalBanner(s);
  if (!data.can_see_results) {
    out.push(banner, hiddenResults(), h("section", { class: "card" }, votedFooter()));
    return setChildren(els.body, out);
  }
  const responses = data.responses;
  const schedules = s.questions.filter((q) => q.type === "schedule");
  if (schedules.length && responses.length) {
    for (const q of schedules) out.push(favoriteCard(s, q, responses, { several: schedules.length > 1 }));
  } else {
    out.push(banner);
  }
  const several = s.questions.length > 1;
  const card = h("section", { class: "card" },
    !responses.length && h("p", { class: "muted" }, t("results.empty")),
    responses.length > 0 && s.questions.map((q) => {
      const title = several || q.type !== "schedule" ? q.label : null;
      if (q.type === "schedule") return scheduleOverview(withFinal(q), responses, data.mine, title);
      if (q.type === "choice") return choiceOverview(q, responses, data.mine, title);
      return textOverview(q, responses, title);
    }),
    votedFooter());
  out.push(card);
  setChildren(els.body, out);
}

// --- my answer -------------------------------------------------------------------------

function renderMine() {
  const s = data.survey;
  if (needsLogin()) {
    return setChildren(els.body, h("section", { class: "card login-needed" },
      h("p", {}, t("vote.login_required")),
      h("a", { class: "btn btn-primary", href: loginUrl() }, t("auth.login"))));
  }
  if (!data.mine && s.is_closed) {
    return setChildren(els.body, h("section", { class: "card" }, h("p", { class: "muted" }, t("vote.closed_info"))));
  }
  if (!draft) initDraft();
  const editable = canChange();
  const err = h("p", { class: "error", role: "alert" });

  const who = data.mine
    ? h("div", { class: "answer-who" }, avatar(data.mine.name, "avatar-me avatar-lg"),
      h("div", {},
        h("strong", {}, t("mine.title")),
        h("small", { class: "muted" }, t("ov.voted_as", { name: data.mine.name, date: fmtDate(new Date(data.mine.created), { dateStyle: "short", timeStyle: "short" }) }))))
    : h("div", { class: "answer-who" }, avatar(draft.name || "?", "avatar-me avatar-lg"),
      h("div", { class: "answer-who-main" },
        h("strong", {}, t("mine.title")),
        data.participant.name_fixed
          ? h("small", { class: "muted" }, t("vote.as_account", { name: draft.name }))
          : h("input", {
            type: "text", class: "name-input", maxlength: limit("name"), value: draft.name, autocomplete: "name",
            placeholder: t("vote.name_ph"), "aria-label": t("vote.name"),
            oninput: (e) => {
              draft.name = e.target.value;
              dirty = true;
            },
          }),
        data.participant.invited_as && h("small", { class: "muted" }, t("vote.invited_as", { email: data.participant.invited_as }))));

  const form = h("form", {
    class: "card answer-card", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      submit(form, err);
    },
  },
  who,
  s.questions.map((q) => questionInput(q, editable, s.questions.length > 1)),
  h("label", { class: "answer-block comment-block" },
    h("span", { class: "field-label muted" }, t("mine.comment")),
    // One line high like the placeholder; grows with the text
    autoTextarea({
      class: "comment-input", maxlength: limit("comment"), value: draft.comment, disabled: !editable, placeholder: t("mine.comment_ph"),
      oninput: (e) => {
        draft.comment = e.target.value;
        dirty = true;
      },
    })),
  err,
  editable && h("div", { class: "card-foot" },
    data.mine
      ? h("button", { type: "button", class: "btn-link danger", onclick: deleteMine }, t("vote.delete"))
      : h("span"),
    h("button", { type: "submit", class: "btn btn-primary" }, t(data.mine ? "vote.save" : "vote.submit"))),
  !editable && h("p", { class: "muted small" }, t(s.is_closed ? "vote.closed_info" : "err.edit_disabled")));
  setChildren(els.body, form);
}

function questionInput(q, editable, several) {
  const block = h("div", { class: "answer-block" },
    (several || q.type !== "schedule") && h("h3", { class: "q-title" }, q.label, q.required && h("span", { class: "req", title: t("create.required") }, " *")));

  if (q.type === "schedule") {
    const ans = draft.answers[q.id];
    const states = q.maybe ? ["yes", "maybe", "no"] : ["yes", "no"];
    for (const slot of q.slots) {
      const p = slotParts(slot);
      const row = h("div", { class: "slot-block" },
        h("div", { class: "slot-block-head" }, h("strong", {}, p.day), h("span", { class: "muted" }, p.time)));
      const btns = h("div", { class: `choice3 n${states.length}`, role: "group", "aria-label": `${p.day} ${p.time}` });
      const paint = () => btns.querySelectorAll(".ans-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === ans[slot])));
      for (const v of states) {
        btns.append(h("button", {
          type: "button", class: `ans-btn ans-${v}`, "data-v": v, disabled: !editable,
          onclick: () => {
            // Explicit "no" is kept for display only; the server stores yes/maybe and treats the rest as no
            ans[slot] = v;
            dirty = true;
            paint();
          },
        }, ICON[v], " ", t(`answer.${v}`)));
      }
      paint();
      row.append(btns);
      block.append(row);
    }
  } else if (q.type === "choice") {
    const cur = draft.answers[q.id] || [];
    if (q.multi) block.append(h("p", { class: "hint" }, t("vote.multi_hint")));
    block.append(h("div", { class: "choices" }, q.options.map((o) =>
      h("label", { class: "choice" },
        h("input", {
          type: q.multi ? "checkbox" : "radio", name: q.id, value: o, checked: cur.includes(o), disabled: !editable,
          onchange: () => {
            draft.answers[q.id] = [...block.querySelectorAll("input:checked")].map((i) => i.value);
            dirty = true;
          },
        }),
        h("span", {}, o)))));
  } else {
    block.append(h("textarea", {
      rows: 3, maxlength: limit("text"), value: draft.answers[q.id] || "", "aria-label": q.label, disabled: !editable,
      oninput: (e) => {
        draft.answers[q.id] = e.target.value;
        dirty = true;
      },
    }));
  }
  return block;
}

function isEmpty(q, a) {
  if (q.type === "choice") return !a || !a.length;
  if (q.type === "schedule") return !a || !Object.values(a).some((v) => v === "yes" || v === "maybe");
  return !a || !String(a).trim();
}

async function submit(form, err) {
  const btn = form.querySelector("[type=submit]");
  const name = draft.name.trim();
  if (!name && !data.participant.name_fixed) {
    err.textContent = t("err.name_required");
    return;
  }
  const missing = data.survey.questions.find((q) => q.required && isEmpty(q, draft.answers[q.id]));
  if (missing) {
    err.textContent = t("err.answer_required_q", { q: missing.label });
    return;
  }
  err.textContent = "";
  btn.disabled = true;
  try {
    const body = { name, answers: draft.answers, comment: draft.comment.trim() };
    if (data.mine) {
      await client.updateResponse(data.mine.id, body);
    } else {
      const r = await client.respond(body);
      creds.remember(r.id, r.edit_key);
    }
    if (!data.participant.name_fixed) store.set(NAME_KEY, name);
    dirty = false;
    draft = null;
    await load();
    tab = "overview";
    render();
    toast(t("vote.thanks"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    err.textContent = errMsg(e);
  } finally {
    btn.disabled = false;
  }
}

async function deleteMine() {
  if (!confirm(t("vote.delete_confirm"))) return;
  try {
    await client.deleteResponse(data.mine.id);
    creds.forgetResponse();
    draft = null;
    await load();
    tab = "overview";
    render();
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

// --- all answers -------------------------------------------------------------------------

function renderAll() {
  const s = data.survey;
  if (!data.can_see_results) return setChildren(els.body, hiddenResults());
  const responses = sortResponses(data.responses, sortBy);
  const several = s.questions.length > 1;
  const sortBtn = h("button", {
    type: "button", class: "pill-btn pill-soft",
    onclick: () => {
      sortBy = sortBy === "name" ? "date" : "name";
      renderAll();
    },
  }, t("all.sort"), " ", h("strong", {}, t(`all.sort_${sortBy}`)));
  const csvBtn = h("button", { type: "button", class: "pill-btn pill-soft", disabled: !responses.length, onclick: () => exportCsv(s, data.responses) }, "CSV");

  const card = h("section", { class: "card" },
    h("div", { class: "card-head" },
      h("h2", {}, t("all.title", { n: responses.length })),
      h("div", { class: "card-head-actions" }, sortBtn, csvBtn)),
    !responses.length && h("p", { class: "muted" }, t("results.empty")),
    responses.length > 0 && s.questions.map((q) => {
      if (q.type === "text") return null;
      return h("div", { class: "all-block" },
        several && h("h3", { class: "q-title" }, q.label),
        q.type === "schedule" ? scheduleMatrix(withFinal(q), responses, { mineId: data.mine?.id }) : choiceMatrix(q, responses, { mineId: data.mine?.id }));
    }),
    responses.length > 0 && s.questions.some((q) => q.type === "schedule") && legend(s.questions.find((q) => q.type === "schedule")),
    responses.length > 0 && s.questions.filter((q) => q.type === "text").map((q) => textOverview(q, responses, q.label)),
    commentsList(responses));
  setChildren(els.body, card);
}

// --- realtime ----------------------------------------------------------------------------

async function refresh() {
  try {
    await load();
    renderHead();
    // Never throw away what the user is typing
    if (tab === "mine" && dirty) return;
    if (tab === "mine") draft = null;
    renderBody();
  } catch (e) {
    if (e.status === 404) app.replaceChildren(errorCard(errMsg(e)));
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
  subscribe(id, refresh);
}

main();
