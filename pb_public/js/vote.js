import { h, store, params, hashParams, field, toast, errorCard } from "./util.js";
import { t, initI18n, onLangChange, fmtDate } from "./i18n.js";
import { api, errMsg, subscribe, currentUser, setInviteToken } from "./api.js";
import { renderResults, finalBanner, slotLabel, ICON } from "./results.js";
import { initHeader, loginUrl } from "./header.js";

const app = document.getElementById("app");
const id = params.get("id");
const MINE_KEY = `eventi:r:${id}`;
const NAME_KEY = "eventi:name";
const INVITE_KEY = `eventi:i:${id}`;

// Personal invitation link (#i=token): remember it for this survey and drop it from the address bar
let inviteToken = hashParams.get("i") || store.get(INVITE_KEY) || "";
if (hashParams.get("i")) {
  store.set(INVITE_KEY, inviteToken);
  history.replaceState(null, "", location.pathname + location.search);
}
setInviteToken(inviteToken);

let data = null;
let mine = store.get(MINE_KEY); // { id, key } of own response
let draft = null;               // { name, answers } being edited
let editing = false;
let dirty = false;
const els = {};

async function load() {
  const headers = mine ? { "X-Response-Id": mine.id, "X-Edit-Key": mine.key } : {};
  data = await api.getSurvey(id, headers);
  if (inviteToken && !data.invitation) {
    // Invitation was removed by the owner
    store.del(INVITE_KEY);
    inviteToken = "";
    setInviteToken("");
  }
  if (mine && !data.mine) {
    store.del(MINE_KEY);
    mine = null;
  }
  // Response given with the account (e.g. on another device): edit via login, no key needed
  if (!mine && data.mine) mine = { id: data.mine.id, key: "" };
}

// Name used with "only with an account": account name, else the invitation's name
function fixedName() {
  if (currentUser()) return currentUser().display_name;
  const inv = data.invitation;
  return inv ? inv.name || inv.email.split("@")[0] : "";
}

function initDraft() {
  draft = data.mine
    ? { name: data.mine.name, answers: structuredClone(data.mine.answers) }
    : { name: data.invitation?.name || store.get(NAME_KEY) || currentUser()?.display_name || "", answers: {} };
  if (data.survey.settings.require_login) draft.name = fixedName();
  for (const q of data.survey.questions) {
    if (q.type === "schedule" && !draft.answers[q.id]) draft.answers[q.id] = {};
  }
}

function render() {
  document.title = `${data.survey.title} · eventi`;
  els.head = h("div");
  els.form = h("div");
  els.results = h("div");
  app.replaceChildren(els.head, els.form, els.results);
  renderHead();
  renderForm();
  renderRes();
}

function renderHead() {
  const s = data.survey;
  els.head.replaceChildren(
    h("section", { class: "card" },
      h("h1", {}, s.title),
      s.description && h("p", { class: "desc" }, s.description),
      h("div", { class: "meta" },
        h("span", { class: "pill" }, t("vote.participants", { n: data.count })),
        s.is_closed
          ? h("span", { class: "pill pill-closed" }, t("status.closed"))
          : s.closes_at && h("span", { class: "pill" }, t("status.closes", { date: fmtDate(new Date(s.closes_at), { dateStyle: "medium", timeStyle: "short" }) })))),
    finalBanner(s));
}

function renderForm() {
  const s = data.survey;
  const el = els.form;
  el.replaceChildren();
  const canChange = !s.is_closed && s.settings.allow_edit;

  if (data.mine && !editing) {
    el.append(h("section", { class: "card voted" },
      h("p", {}, `✅ ${t("vote.voted_as", { name: data.mine.name })}`),
      canChange && h("div", { class: "btn-row" },
        h("button", {
          type: "button", class: "btn",
          onclick: () => {
            editing = true;
            initDraft();
            renderForm();
          },
        }, t("vote.edit")),
        h("button", { type: "button", class: "btn btn-ghost danger", onclick: deleteMine }, t("vote.delete")))));
    return;
  }
  if (s.is_closed) {
    el.append(h("section", { class: "card" }, h("p", { class: "muted" }, t("vote.closed_info"))));
    return;
  }
  if (s.settings.require_login && !currentUser() && !data.invitation) {
    el.append(h("section", { class: "card login-needed" },
      h("p", {}, t("vote.login_required")),
      h("a", { class: "btn btn-primary", href: loginUrl() }, t("auth.login"))));
    return;
  }

  if (!draft) initDraft();
  const err = h("p", { class: "error", role: "alert" });
  const form = h("form", {
    class: "vote-form", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      submit(form, err);
    },
  });
  form.append(h("section", { class: "card" },
    s.settings.require_login
      ? h("p", { class: "as-account" }, t("vote.as_account", { name: draft.name }))
      : field(t("vote.name"), h("input", {
      type: "text", maxlength: 60, value: draft.name, autocomplete: "name", placeholder: t("vote.name_ph"),
      oninput: (e) => {
        draft.name = e.target.value;
        dirty = true;
      },
    })),
    data.invitation && h("small", { class: "hint" }, t("vote.invited_as", { email: data.invitation.email }))));
  for (const q of s.questions) form.append(questionInput(q));
  form.append(err, h("div", { class: "btn-row" },
    h("button", { type: "submit", class: "btn btn-primary btn-lg" }, t(data.mine ? "vote.save" : "vote.submit")),
    data.mine && h("button", {
      type: "button", class: "btn btn-ghost",
      onclick: () => {
        editing = false;
        dirty = false;
        draft = null;
        renderForm();
      },
    }, t("action.cancel"))));
  el.append(form);
}

function questionInput(q) {
  const card = h("section", { class: "card q" },
    h("h2", { class: "q-title" }, q.label, q.required && h("span", { class: "req", title: t("create.required") }, " *")));

  if (q.type === "choice") {
    const cur = draft.answers[q.id] || [];
    if (q.multi) card.append(h("p", { class: "hint" }, t("vote.multi_hint")));
    card.append(h("div", { class: "choices" }, q.options.map((o) =>
      h("label", { class: "choice" },
        h("input", {
          type: q.multi ? "checkbox" : "radio", name: q.id, value: o, checked: cur.includes(o),
          onchange: () => {
            draft.answers[q.id] = [...card.querySelectorAll("input:checked")].map((i) => i.value);
            dirty = true;
          },
        }),
        h("span", {}, o)))));
  } else if (q.type === "schedule") {
    const ans = draft.answers[q.id];
    const states = q.maybe ? ["yes", "maybe", "no"] : ["yes", "no"];
    card.append(h("p", { class: "hint legend" },
      states.map((v) => h("span", {}, h("span", { class: `dot dot-${v}` }), t(`answer.${v}`)))));
    card.append(h("div", { class: "slots" }, q.slots.map((slot) => {
      const row = h("div", { class: "slot-row" });
      const paint = () => {
        const cur = ans[slot] || "no";
        row.dataset.state = cur;
        row.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === cur)));
      };
      row.append(slotLabel(slot), h("div", { class: "seg", role: "group" }, states.map((v) =>
        h("button", {
          type: "button", class: `seg-btn seg-${v}`, "data-v": v, title: t(`answer.${v}`), "aria-label": t(`answer.${v}`),
          onclick: () => {
            if (v === "no") delete ans[slot];
            else ans[slot] = v;
            dirty = true;
            paint();
          },
        }, ICON[v]))));
      paint();
      return row;
    })));
  } else {
    card.append(h("textarea", {
      rows: 3, maxlength: 2000, value: draft.answers[q.id] || "", "aria-label": q.label,
      oninput: (e) => {
        draft.answers[q.id] = e.target.value;
        dirty = true;
      },
    }));
  }
  return card;
}

function isEmpty(q, a) {
  if (q.type === "choice") return !a || !a.length;
  if (q.type === "schedule") return !a || !Object.keys(a).length;
  return !a || !String(a).trim();
}

async function submit(form, err) {
  const btn = form.querySelector("[type=submit]");
  const name = draft.name.trim();
  if (!name) {
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
    const body = { name, answers: draft.answers };
    if (data.mine) {
      await api.updateVote(mine.id, mine.key, body);
    } else {
      const r = await api.vote(id, body);
      mine = { id: r.id, key: r.edit_key };
      store.set(MINE_KEY, mine);
    }
    if (!data.survey.settings.require_login) store.set(NAME_KEY, name);
    editing = false;
    dirty = false;
    draft = null;
    await load();
    render();
    toast(t("vote.thanks"));
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    err.textContent = errMsg(e);
  } finally {
    btn.disabled = false;
  }
}

async function deleteMine() {
  if (!confirm(t("vote.delete_confirm"))) return;
  try {
    await api.deleteVote(mine.id, mine.key ? { "X-Edit-Key": mine.key } : {});
    store.del(MINE_KEY);
    mine = null;
    draft = null;
    await load();
    render();
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

function renderRes() {
  const el = els.results;
  el.replaceChildren();
  if (!data.can_see_results) {
    const key = data.survey.settings.results === "after_vote" ? "results.after_vote" : "results.hidden";
    el.append(h("section", { class: "card" }, h("p", { class: "muted" }, t(key))));
    return;
  }
  const box = h("div");
  el.append(h("h2", { class: "section-title" }, t("results.title")), box);
  renderResults(box, data.survey, data.responses, { mineId: mine?.id });
}

async function refresh() {
  try {
    const wasClosed = data.survey.is_closed;
    await load();
    renderHead();
    renderRes();
    if (!dirty || wasClosed !== data.survey.is_closed) renderForm();
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
