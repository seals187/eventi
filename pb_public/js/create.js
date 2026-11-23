import { h, uid, params, hashParams, publicUrl, adminUrl, iconBtn, linkBox, errorCard, icon, toggleChip, menu, autoTextarea } from "./util.js";
import { t, tn, initI18n, onLangChange, fmtDate, parseSlot } from "./i18n.js";
import { api, errMsg, currentUser } from "./api.js";
import { initHeader, renderMineMenu, loginUrl } from "./header.js";

const app = document.getElementById("app");
const editId = params.get("edit");
let editKey = hashParams.get("k") || "";

const TYPE_ICON = { schedule: "calendar", choice: "list", text: "text" };

let state = null;       // editor state
let created = null;     // { id, admin_key } after creation
let existingCount = 0;  // responses already given (edit mode)

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

function newQuestion(type) {
  const q = { id: uid(), type, label: "", required: false };
  if (type === "choice") Object.assign(q, { options: ["", ""], multi: false });
  if (type === "schedule") Object.assign(q, { dates: {}, maybe: true, month: monthOf(new Date()) });
  return q;
}

function blank() {
  return {
    title: "",
    description: "",
    questions: [newQuestion("schedule")],
    settings: { results: "always", allow_edit: true, require_login: false },
    closes_at: "",
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

  app.append(h("section", { class: "compose-head" },
    h("p", { class: "eyebrow accent" }, t(editId ? "create.eyebrow_edit" : "create.eyebrow_new")),
    h("input", {
      type: "text", class: "title-input", maxlength: 200, value: state.title,
      placeholder: t("create.title_ph"), "aria-label": t("create.survey_title"),
      oninput: (e) => (state.title = e.target.value),
    }),
    autoTextarea({
      class: "desc-input", maxlength: 2000, value: state.description,
      placeholder: t("create.description_ph"), "aria-label": t("create.description"),
      oninput: (e) => (state.description = e.target.value),
    })));
  if (existingCount) app.append(h("p", { class: "notice" }, t("create.edit_warning", { n: existingCount })));

  app.append(h("div", { id: "questions" }));
  renderQuestions();

  app.append(h("div", { class: "add-grid" }, ["schedule", "choice", "text"].map((type) =>
    h("button", {
      type: "button", class: "add-btn", disabled: state.questions.length >= 20,
      onclick: () => addQuestion(type),
    }, `+ ${t(`qtype.${type}`)}`))));

  app.append(settingsCard());

  const summary = h("p", { class: "bar-summary", id: "summary", role: "status" });
  const btn = h("button", { type: "button", class: "btn btn-primary btn-lg", onclick: () => submit(btn, summary) },
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
  el.textContent = parts.join(" · ");
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
  if (!state.questions.length) wrap.append(h("p", { class: "muted center" }, t("create.no_questions")));
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
    body,
    h("div", { class: "q-foot" }, chips));
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
        h("p", { class: "date-count" }, dates.length ? tn("create.days_selected", dates.length) : t("create.pick_dates")),
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
        else q.dates[key] = [];
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

  return h("div", { class: "date-card" },
    h("div", { class: "date-card-head" },
      h("strong", {}, fmtDate(parseSlot(d).date, { weekday: "short", day: "numeric", month: "short" })),
      iconBtn(icon("x"), t("action.remove"), false, () => {
        delete q.dates[d];
        rerender();
      })),
    h("div", { class: "chips" },
      times.length
        ? times.map((tm) => h("span", { class: "chip chip-time" }, tm,
          h("button", {
            type: "button", class: "chip-x", "aria-label": `${t("action.remove")} ${tm}`,
            onclick: () => {
              times.splice(times.indexOf(tm), 1);
              rerender();
            },
          }, icon("x"))))
        : h("span", { class: "chip chip-time" }, t("create.allday_chip")),
      adder));
}

function settingsCard() {
  // Invisible native select covers the row; the visible text shows the current choice
  const current = h("span", {}, t(`settings.results_${state.settings.results}`));
  const results = h("select", {
    class: "row-select", "aria-label": t("settings.results"),
    onchange: (e) => {
      state.settings.results = e.target.value;
      current.textContent = t(`settings.results_${e.target.value}`);
    },
  }, ["always", "after_vote", "hidden"].map((v) =>
    h("option", { value: v, selected: state.settings.results === v }, t(`settings.results_${v}`))));

  return h("section", { class: "card settings" },
    h("h2", { class: "settings-title" }, t("create.settings")),
    h("label", { class: "set-row has-select" },
      h("span", {}, t("settings.results")),
      h("span", { class: "set-value" }, current, icon("right")),
      results),
    h("label", { class: "set-row" },
      h("span", {}, t("settings.allow_edit")),
      h("input", {
        type: "checkbox", role: "switch", class: "switch", checked: state.settings.allow_edit,
        onchange: (e) => (state.settings.allow_edit = e.target.checked),
      })),
    h("label", { class: "set-row" },
      h("span", {}, t("settings.require_login"), h("small", { class: "hint" }, t("settings.require_login_hint"))),
      h("input", {
        type: "checkbox", role: "switch", class: "switch", checked: state.settings.require_login,
        onchange: (e) => (state.settings.require_login = e.target.checked),
      })),
    closeRow());
}

function closeRow() {
  const row = h("div", { class: "set-row" });
  const paint = (open) => {
    const right = h("span", { class: "set-value" });
    if (state.closes_at || open) {
      const input = h("input", {
        type: "datetime-local", class: "row-date", value: state.closes_at, "aria-label": t("settings.closes_at"),
        oninput: (e) => (state.closes_at = e.target.value),
      });
      right.append(input, iconBtn(icon("x"), t("settings.never"), false, () => {
        state.closes_at = "";
        paint(false);
      }));
      if (open) {
        requestAnimationFrame(() => {
          input.focus();
          try { input.showPicker(); } catch { /* not supported */ }
        });
      }
    } else {
      right.append(h("button", { type: "button", class: "link-value", onclick: () => paint(true) }, t("settings.never"), icon("right")));
    }
    row.replaceChildren(h("span", {}, t("settings.closes_at")), right);
  };
  paint(false);
  return row;
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
      await api.updateSurvey(editId, editKey, p);
      location.href = adminUrl(editId, editKey);
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
      const d = await api.getSurvey(editId, editKey ? { "X-Admin-Key": editKey } : {});
      if (!d.admin) throw Object.assign(new Error("err.forbidden"), { status: 403 });
      editKey = d.admin_key || editKey;
      state = fromSurvey(d.survey);
      existingCount = d.count;
    } catch (e) {
      app.replaceChildren(errorCard(errMsg(e)));
      return;
    }
  } else {
    state = blank();
  }
  onLangChange(render);
  render();
}

main();
