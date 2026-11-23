import { h, uid, params, hashParams, publicUrl, adminUrl, iconBtn, linkBox, errorCard, icon, toggleChip, menu, autoTextarea, toast } from "./util.js";
import { t, tn, initI18n, onLangChange, fmtDate, parseSlot } from "./i18n.js";
import { api, surveyClient, errMsg, currentUser } from "./api.js";
import { initHeader, renderMineMenu, loginUrl, ownSurveys } from "./header.js";

const app = document.getElementById("app");
const editId = params.get("edit");
// Edit mode: admin link key from the URL (owners get it from the server)
const editClient = editId ? surveyClient(editId, { adminKey: hashParams.get("k") || "" }) : null;

const TYPE_ICON = { schedule: "calendar", choice: "list", text: "text" };

let state = null;       // editor state
let created = null;     // { id, admin_key } after creation
let existingCount = 0;  // responses already given (edit mode)

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

function newQuestion(type, label = "") {
  const q = { id: uid(), type, label, required: false };
  if (type === "choice") Object.assign(q, { options: ["", ""], multi: false });
  if (type === "schedule") Object.assign(q, { dates: {}, maybe: true, month: monthOf(new Date()) });
  return q;
}

// Templates on the start page. Labels are translated when the template is applied.
const TEMPLATES = [
  { key: "dinner", icon: "utensils", tags: ["schedule", "choice"], build: () => [newQuestion("schedule", t("tpl.dinner_q1")), newQuestion("choice", t("tpl.dinner_q2"))] },
  { key: "meeting", icon: "users", tags: ["schedule"], build: () => [Object.assign(newQuestion("schedule", t("tpl.meeting_q1")), { defaultTimes: ["09:00", "14:00"] })] },
  { key: "birthday", icon: "cake", tags: ["schedule", "text"], build: () => [newQuestion("schedule", t("tpl.birthday_q1")), newQuestion("text", t("tpl.birthday_q2"))] },
  { key: "trip", icon: "map", tags: ["schedule", "choice"], build: () => [newQuestion("schedule", t("tpl.trip_q1")), newQuestion("choice", t("tpl.trip_q2"))] },
  { key: "feedback", icon: "chat", tags: ["text"], build: () => [newQuestion("text", t("tpl.feedback_q1")), newQuestion("text", t("tpl.feedback_q2"))] },
];

// Has the user already typed something into the questions?
const questionsTouched = () => state.questions.some((q) =>
  (q.type === "choice" && q.options.some((o) => o.trim())) || (q.type === "schedule" && Object.keys(q.dates).length));

function applyTemplate(tpl) {
  if (state.template === tpl.key && !state.pickTemplate) return;
  if (questionsTouched() && !confirm(t("tpl.replace_confirm"))) return;
  state.template = tpl.key;
  state.copyOf = null;
  state.pickTemplate = false;
  state.questions = tpl.build();
  render();
  app.querySelector(".q-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// "×" on the template bar: back to the start screen
function clearTemplate() {
  if (questionsTouched() && !confirm(t("tpl.replace_confirm"))) return;
  state.template = null;
  state.copyOf = null;
  state.pickTemplate = false;
  state.questions = [];
  render();
}

// Copy questions and settings of an own survey into the editor
async function duplicate(s) {
  try {
    const d = await surveyClient(s.id, { adminKey: s.admin_key }).load();
    const copy = fromSurvey(d.survey);
    state = { ...copy, title: copy.title, closes_at: "", template: "copy", copyOf: copy.title, pickTemplate: false, showDesc: !!copy.description };
    render();
    toast(t("tpl.duplicated"));
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

function blank() {
  return {
    title: "",
    description: "",
    questions: [],
    settings: { results: "always", allow_edit: true, require_login: false },
    closes_at: "",
    template: null,   // key of the chosen template (or "blank")
    showDesc: false,
  };
}

function fromSurvey(s) {
  const toLocalInput = (iso) => {
    const d = new Date(iso);
    return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return {
    title: s.title,
    description: s.description,
    settings: { ...s.settings },
    closes_at: s.closes_at ? toLocalInput(s.closes_at) : "",
    questions: s.questions.map((q) => {
      const e = { ...q };
      if (q.type === "schedule") {
        e.dates = {};
        for (const slot of q.slots) {
          const [d, tm] = slot.split("T");
          e.dates[d] ||= [];
          if (tm) e.dates[d].push(tm);
        }
        e.month = q.slots.length ? monthOf(parseSlot(q.slots[0]).date) : monthOf(new Date());
        delete e.slots;
      }
      return e;
    }),
  };
}

const slotsOf = (q) => Object.keys(q.dates).sort()
  .flatMap((d) => (q.dates[d].length ? q.dates[d].map((tm) => `${d}T${tm}`) : [d]));

function toPayload() {
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    settings: state.settings,
    closes_at: state.closes_at ? new Date(state.closes_at).toISOString() : "",
    questions: state.questions.map((q) => {
      const out = { id: q.id, type: q.type, label: q.label.trim(), required: q.required };
      if (q.type === "choice") {
        out.options = q.options.map((o) => o.trim()).filter(Boolean);
        out.multi = q.multi;
      }
      if (q.type === "schedule") {
        out.maybe = q.maybe;
        out.slots = slotsOf(q);
      }
      return out;
    }),
  };
}

function validate(p) {
  if (!p.title) return "err.title_required";
  if (!p.questions.length) return "err.questions_required";
  for (const q of p.questions) {
    if (!q.label) return "err.question_label_required";
    if (q.type === "choice" && q.options.length < 2) return "err.options_min";
    if (q.type === "schedule" && !q.slots.length) return "err.slots_min";
    if (q.type === "schedule" && q.slots.length > 200) return "err.too_many_slots";
  }
  return null;
}

// --- rendering ---------------------------------------------------------------

function render() {
  app.replaceChildren();
  document.title = "eventi";
  if (created) return renderSuccess();

  const showDesc = state.showDesc || !!state.description;
  app.append(h("section", { class: "compose-head" },
    editId && h("p", { class: "eyebrow accent" }, t("create.eyebrow_edit")),
    h("input", {
      type: "text", class: "title-input", maxlength: 200, value: state.title,
      placeholder: t("create.title_ph"), "aria-label": t("create.survey_title"),
      oninput: (e) => (state.title = e.target.value),
    }),
    showDesc
      ? autoTextarea({
        class: "desc-input", maxlength: 2000, value: state.description,
        placeholder: t("create.description_ph"), "aria-label": t("create.description"),
        oninput: (e) => (state.description = e.target.value),
      })
      : h("button", {
        type: "button", class: "btn-link muted-link",
        onclick: () => {
          state.showDesc = true;
          render();
          app.querySelector(".desc-input")?.focus();
        },
      }, `+ ${t("create.add_description")}`)));
  if (existingCount) app.append(h("p", { class: "notice" }, t("create.edit_warning", { n: existingCount })));

  // Start screen (no questions yet): templates + "add a question directly".
  // Afterwards: template bar, question cards and the small "+ Frage:" chips.
  const start = !editId && !state.questions.length;
  if (start || state.pickTemplate) app.append(templateBox());
  else if (state.template) app.append(templateBar());

  if (start) {
    app.append(directAddBox());
  } else {
    app.append(h("div", { id: "questions" }));
    renderQuestions();
    app.append(h("div", { class: "add-chips" },
      h("span", { class: "muted" }, t("create.add_question")),
      ["schedule", "choice", "text"].map((type) => h("button", {
        type: "button", class: `tag tag-${type} tag-btn`, disabled: state.questions.length >= 20,
        onclick: () => addQuestion(type),
      }, t(`qtype.${type}`)))));
  }

  app.append(settingsChips());

  const summary = h("p", { class: "bar-summary", id: "summary", role: "status" });
  const btn = h("button", { type: "button", class: "btn btn-primary btn-lg", disabled: !state.questions.length, onclick: () => submit(btn, summary) },
    t(editId ? "create.save" : "create.submit"), icon("arrow"));
  app.append(h("div", { class: "submit-bar" }, summary, btn));
  updateSummary();
}

function updateSummary() {
  const el = document.getElementById("summary");
  if (!el) return;
  el.classList.remove("error");
  const parts = [tn("summary.questions", state.questions.length)];
  const schedules = state.questions.filter((q) => q.type === "schedule");
  if (schedules.length) parts.push(tn("summary.slots", schedules.reduce((n, q) => n + slotsOf(q).length, 0)));
  if (state.template === "copy") parts.push(t("tpl.copy"));
  else if (state.template) parts.push(t(`tpl.${state.template}`));
  el.textContent = parts.join(" · ");
}

// Dashed purple box: "✦ Mit Vorlage starten · optional" with template pills and "… duplizieren"
function templateBox() {
  const last = ownSurveys()[0];
  return h("section", { class: "tpl-box" },
    h("div", { class: "tpl-box-head" },
      h("span", {}, h("strong", { class: "tpl-box-title" }, "✦ ", t("start.templates")), h("span", { class: "muted" }, ` · ${t("tpl.optional")}`)),
      last && !editId && h("button", { type: "button", class: "btn-link muted-link small", onclick: () => duplicate(last) },
        icon("history"), t("start.duplicate", { title: last.title }))),
    h("div", { class: "tpl-pills" }, TEMPLATES.map((tpl) => h("button", {
      type: "button", class: "tpl-pill", "aria-pressed": String(state.template === tpl.key),
      title: t(`tpl.${tpl.key}_desc`), onclick: () => applyTemplate(tpl),
    }, icon(tpl.icon), t(`tpl.${tpl.key}`)))),
    state.pickTemplate && h("button", {
      type: "button", class: "btn-link small", onclick: () => {
        state.pickTemplate = false;
        render();
      },
    }, t("action.cancel")));
}

// Dashed box on the start screen: "Oder direkt eine Frage hinzufügen"
function directAddBox() {
  return h("section", { class: "direct-box" },
    h("p", {}, t("start.direct")),
    h("div", { class: "direct-btns" }, ["schedule", "choice", "text"].map((type) => h("button", {
      type: "button", class: `direct-btn direct-${type}`, onclick: () => addQuestion(type),
    }, icon(TYPE_ICON[type]), t(`start.add_${type}`)))));
}

// "🍴 Teamessen · Vorlage   Ändern ×" above the questions
function templateBar() {
  const tpl = TEMPLATES.find((x) => x.key === state.template);
  return h("section", { class: "tpl-bar" },
    icon(tpl ? tpl.icon : "history"),
    h("strong", {}, tpl ? t(`tpl.${tpl.key}`) : state.copyOf || t("tpl.copy")),
    h("span", { class: "muted small" }, ` · ${t(tpl ? "start.template" : "tpl.copy")}`),
    h("span", { class: "spacer" }),
    h("button", {
      type: "button", class: "btn-link", onclick: () => {
        state.pickTemplate = true;
        render();
      },
    }, t("start.change")),
    iconBtn(icon("x"), t("start.remove_template"), false, clearTemplate));
}

// Settings as compact chips: "Results: Everyone ›", "Editable: Yes ›", "Account: No ›", "Closes: Never ›"
function settingsChips() {
  const s = state.settings;
  // The value cell stacks all possible values (only the current one visible), so a chip keeps its width
  // when the value changes (e.g. "Yes" -> "No")
  const chip = (label, value, options = [value]) => [h("span", { class: "muted" }, `${label}:`), " ",
    h("span", { class: "chip-val" }, [...new Set([value, ...options])].map((v) => h("strong", v === value ? {} : { class: "ghost", "aria-hidden": "true" }, v))),
    icon("right")];
  const toggle = (label, prop, title) => h("button", {
    type: "button", class: "set-chip", "aria-pressed": String(s[prop]), title,
    onclick: () => {
      s[prop] = !s[prop];
      render();
    },
  }, chip(label, t(s[prop] ? "set.yes" : "set.no"), [t("set.yes"), t("set.no")]));

  const results = h("details", { class: "menu set-menu" },
    h("summary", { class: "set-chip" }, chip(t("set.results"), t(`set.results_${s.results}`), ["always", "after_vote", "hidden"].map((v) => t(`set.results_${v}`)))),
    h("div", { class: "menu-pop menu-left" },
      h("p", { class: "menu-title" }, t("settings.results")),
      ["always", "after_vote", "hidden"].map((v) => h("button", {
        type: "button", class: "menu-item", onclick: () => {
          s.results = v;
          render();
        },
      }, v === s.results ? icon("check") : h("span", { class: "ic" }), t(`settings.results_${v}`)))));

  const closeLabel = state.closes_at ? fmtDate(new Date(state.closes_at), { dateStyle: "short", timeStyle: "short" }) : t("settings.never");
  const closes = h("details", { class: "menu set-menu" },
    h("summary", { class: "set-chip" }, chip(t("set.closes"), closeLabel, [t("settings.never"), fmtDate(new Date(2026, 11, 31, 23, 59), { dateStyle: "short", timeStyle: "short" })])),
    h("div", { class: "menu-pop menu-left menu-form" },
      h("p", { class: "menu-title" }, t("settings.closes_at")),
      h("input", {
        type: "datetime-local", value: state.closes_at, "aria-label": t("settings.closes_at"),
        onchange: (e) => {
          state.closes_at = e.target.value;
          render();
        },
      }),
      state.closes_at && h("button", {
        type: "button", class: "btn btn-sm", onclick: () => {
          state.closes_at = "";
          render();
        },
      }, t("settings.never"))));

  return h("section", { class: "settings-chips" },
    h("p", { class: "eyebrow" }, icon("gear"), " ", t("create.settings")),
    h("div", { class: "chip-row" },
      results,
      toggle(t("set.editable"), "allow_edit"),
      toggle(t("set.account"), "require_login", t(`set.hint_${s.require_login ? "account" : "open"}`)),
      closes));
}

function addQuestion(type) {
  state.questions.push(newQuestion(type));
  render();
  const cards = app.querySelectorAll(".q-card");
  const last = cards[cards.length - 1];
  last?.scrollIntoView({ behavior: "smooth", block: "center" });
  last?.querySelector(".q-label")?.focus({ preventScroll: true });
}

function renderQuestions() {
  const wrap = document.getElementById("questions");
  wrap.replaceChildren(...state.questions.map(questionCard));
  if (!state.questions.length && (state.template || editId)) wrap.append(h("p", { class: "muted center" }, t("create.no_questions")));
  updateSummary();
}

function move(i, dir) {
  const [q] = state.questions.splice(i, 1);
  state.questions.splice(i + dir, 0, q);
  renderQuestions();
}

function questionCard(q, i) {
  const body = h("div", { class: "q-body" });
  const rerender = () => {
    body.replaceChildren(...bodyFor(q, rerender, body));
    updateSummary();
  };
  body.replaceChildren(...bodyFor(q, rerender, body));
  const n = state.questions.length;

  const chips = [];
  if (q.type === "schedule") chips.push(toggleChip(t("create.allow_maybe"), q.maybe, (v) => (q.maybe = v)));
  if (q.type === "choice") chips.push(toggleChip(t("create.multi"), q.multi, (v) => (q.multi = v)));
  chips.push(toggleChip(t("create.required"), q.required, (v) => (q.required = v)));

  return h("section", { class: "card q-card" },
    h("div", { class: "q-head" },
      h("span", { class: "q-num" }, pad(i + 1)),
      h("span", { class: `badge badge-${q.type}` }, icon(TYPE_ICON[q.type]), t(`qtype.${q.type}`)),
      h("span", { class: "spacer" }),
      // Question options as small toggles in the header row (saves a row per question)
      h("span", { class: "q-toggles" }, chips),
      menu(icon("more"), t("action.more"), [
        { icon: "up", label: t("action.up"), disabled: i === 0, onClick: () => move(i, -1) },
        { icon: "down", label: t("action.down"), disabled: i === n - 1, onClick: () => move(i, 1) },
        {
          icon: "trash", label: t("action.remove"), danger: true,
          onClick: () => {
            state.questions.splice(i, 1);
            render();
          },
        },
      ])),
    h("input", {
      type: "text", class: "q-label", maxlength: 300, value: q.label,
      placeholder: t(`create.qlabel_ph_${q.type}`), "aria-label": t("create.question"),
      oninput: (e) => (q.label = e.target.value),
    }),
    body);
}

function bodyFor(q, rerender, body) {
  if (q.type === "choice") return choiceBody(q, rerender, body);
  if (q.type === "schedule") return scheduleBody(q, rerender);
  return [];
}

function choiceBody(q, rerender, body) {
  const focusOpt = (j) => requestAnimationFrame(() => body.querySelectorAll(".opt-row input")[j]?.focus());
  const rows = q.options.map((o, j) => h("div", { class: "opt-row" },
    h("span", { class: "opt-dot", "aria-hidden": "true" }),
    h("input", {
      type: "text", value: o, maxlength: 200, placeholder: t("create.option_n", { n: j + 1 }),
      oninput: (e) => (q.options[j] = e.target.value),
      onkeydown: (e) => {
        if (e.key !== "Enter" || q.options.length >= 50) return;
        e.preventDefault();
        q.options.splice(j + 1, 0, "");
        rerender();
        focusOpt(j + 1);
      },
    }),
    iconBtn(icon("x"), t("action.remove"), q.options.length <= 2, () => {
      q.options.splice(j, 1);
      rerender();
    })));
  return [
    h("div", { class: "opts" }, rows),
    q.options.length < 50 && h("button", {
      type: "button", class: "btn-link",
      onclick: () => {
        q.options.push("");
        rerender();
        focusOpt(q.options.length - 1);
      },
    }, `+ ${t("create.add_option")}`),
  ];
}

function scheduleBody(q, rerender) {
  const dates = Object.keys(q.dates).sort();
  const firstTimes = dates.length ? q.dates[dates[0]] : [];
  return [
    h("div", { class: "sched" },
      calendar(q, rerender),
      h("div", { class: "date-list" },
        !dates.length && h("p", { class: "date-count" }, t("create.pick_dates")),
        dates.map((d) => dateCard(q, d, rerender)),
        dates.length > 1 && firstTimes.length > 0 && h("button", {
          type: "button", class: "btn-link small",
          onclick: () => {
            for (const d of dates) q.dates[d] = [...firstTimes];
            rerender();
          },
        }, t("create.copy_times")))),
  ];
}

function calendar(q, rerender) {
  const m = q.month;
  const y = m.getFullYear(), mo = m.getMonth();
  const today = ymd(new Date());
  const grid = h("div", { class: "cal-grid" });
  // 2024-01-01 was a Monday
  for (let i = 0; i < 7; i++) {
    grid.append(h("span", { class: "cal-wd" }, fmtDate(new Date(2024, 0, 1 + i), { weekday: "short" }).replace(".", "").slice(0, 2)));
  }
  for (let i = 0; i < (m.getDay() + 6) % 7; i++) grid.append(h("span"));
  const last = new Date(y, mo + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const key = ymd(new Date(y, mo, d));
    const sel = key in q.dates;
    grid.append(h("button", {
      type: "button",
      class: `cal-day${sel ? " sel" : ""}${key < today ? " past" : ""}${key === today ? " today" : ""}`,
      "aria-pressed": String(sel),
      "aria-label": fmtDate(new Date(y, mo, d), { dateStyle: "full" }),
      onclick: () => {
        if (sel) delete q.dates[key];
        else q.dates[key] = q.defaultTimes ? [...q.defaultTimes] : [];
        rerender();
      },
    }, String(d)));
  }
  const nav = (dir, ic, label) => h("button", {
    type: "button", class: "cal-nav", "aria-label": label, title: label,
    onclick: () => {
      q.month = new Date(y, mo + dir, 1);
      rerender();
    },
  }, icon(ic));
  return h("div", { class: "cal" },
    h("div", { class: "cal-head" },
      nav(-1, "left", t("cal.prev")),
      h("strong", {}, fmtDate(m, { month: "long", year: "numeric" })),
      nav(1, "right", t("cal.next"))),
    grid);
}

function dateCard(q, d, rerender) {
  const times = q.dates[d];
  const adder = h("span", { class: "time-adder" });

  const showButton = () => adder.replaceChildren(h("button", {
    type: "button", class: "chip chip-add", "aria-label": t("create.add_time"), onclick: openInput,
  }, `+ ${t("create.time")}`));

  function openInput() {
    const input = h("input", { type: "time", class: "chip-input", "aria-label": t("create.add_time") });
    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      if (save && input.value && !times.includes(input.value)) {
        times.push(input.value);
        times.sort();
        rerender();
      } else {
        showButton();
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(true);
      } else if (e.key === "Escape") {
        commit(false);
      }
    });
    input.addEventListener("blur", () => commit(true));
    adder.replaceChildren(input);
    input.focus();
  }
  showButton();

  // One row: "Fr, 4. Dez   [18:00 ×]   + Uhrzeit" (no time = all day; deselect the day in the calendar)
  return h("div", { class: "date-card" },
    h("strong", { class: "date-card-day" }, fmtDate(parseSlot(d).date, { weekday: "short", day: "numeric", month: "short" })),
    h("div", { class: "chips" },
      times.map((tm) => h("span", { class: "chip chip-time" }, tm,
        h("button", {
          type: "button", class: "chip-x", "aria-label": `${t("action.remove")} ${tm}`,
          onclick: () => {
            times.splice(times.indexOf(tm), 1);
            rerender();
          },
        }, icon("x"))))),
    adder);
}


function renderSuccess() {
  const pub = publicUrl(created.id);
  const adm = adminUrl(created.id, created.admin_key);
  app.append(h("section", { class: "card success" },
    h("h1", {}, `🎉 ${t("success.title")}`),
    h("p", { class: "lead" }, t("success.lead")),
    linkBox(t("success.public_link"), pub, t("success.public_hint")),
    linkBox(t("success.admin_link"), adm, t("success.admin_hint"), true),
    h("div", { class: "btn-row" },
      h("a", { class: "btn btn-primary", href: pub }, t("success.open")),
      h("a", { class: "btn", href: adm }, t("success.manage")),
      h("button", {
        type: "button", class: "btn btn-ghost",
        onclick: () => {
          created = null;
          state = blank();
          render();
        },
      }, t("success.new")))));
}

async function submit(btn, summary) {
  const p = toPayload();
  const err = validate(p);
  if (err) {
    summary.textContent = t(err);
    summary.classList.add("error");
    return;
  }
  btn.disabled = true;
  try {
    if (editId) {
      await editClient.update(p);
      location.href = adminUrl(editId, editClient.adminKey);
      return;
    }
    created = await api.createSurvey(p);
    renderMineMenu(true);
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    summary.textContent = errMsg(e);
    summary.classList.add("error");
  } finally {
    btn.disabled = false;
  }
}

async function main() {
  await initI18n();
  await initHeader();
  // Creating requires an account; editing works with the admin link as well
  if (!editId && !currentUser()) {
    location.replace(loginUrl());
    return;
  }
  if (editId) {
    try {
      const d = await editClient.load();
      if (!d.admin) throw Object.assign(new Error("err.forbidden"), { status: 403 });
      state = fromSurvey(d.survey);
      existingCount = d.count;
    } catch (e) {
      app.replaceChildren(errorCard(errMsg(e)));
      return;
    }
  } else {
    state = blank();
    // Deep link to a template: ./?tpl=dinner
    const tpl = TEMPLATES.find((x) => x.key === params.get("tpl"));
    if (tpl) {
      state.template = tpl.key;
      state.questions = tpl.build();
    }
  }
  onLangChange(render);
  render();
}

main();
