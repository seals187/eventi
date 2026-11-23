/// <reference path="../pb_data/types.d.ts" />

// Shared helpers for the eventi routes. Handlers run in isolated VMs, so each
// one loads this module via require() instead of using file-level scope.
// Error messages are i18n keys that the frontend translates.

const LIMITS = {
  title: 200, description: 2000, question_label: 300, option: 200, name: 60, text: 2000, comment: 1000,
  questions: 20, options: 50, options_min: 2, slots: 200,
};
const ID_RE = /^[a-z0-9]{1,16}$/;
const SLOT_RE = /^(\d{4})-(\d{2})-(\d{2})(T([01]\d|2[0-3]):[0-5]\d)?$/;
const RESULTS = ["always", "after_vote", "hidden"];
const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

function fail(code) {
  throw new BadRequestError(code);
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function cleanStr(v, name, required) {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") fail("err.invalid_body");
  v = v.trim();
  if (required && !v) fail("err." + name + "_required");
  if (v.length > LIMITS[name]) fail("err." + name + "_too_long");
  return v;
}

function uniqueStrings(list, name) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (let i = 0; i < list.length; i++) {
    const s = cleanStr(list[i], name, false);
    if (s && out.indexOf(s) < 0) out.push(s);
  }
  return out;
}

function validSlot(s) {
  const m = SLOT_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function readBody(e) {
  let data;
  try {
    data = JSON.parse(toString(e.request.body) || "{}");
  } catch (_) {
    fail("err.invalid_body");
  }
  if (!isObj(data)) fail("err.invalid_body");
  return data;
}

function readJSON(rec, field, fallback) {
  try {
    const raw = rec.getString(field);
    const v = raw ? JSON.parse(raw) : null;
    return v === null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function isoDate(s) {
  return s ? s.replace(" ", "T") : "";
}

function newKey() {
  return $security.randomString(32);
}

function checkKey(given, stored) {
  return !!given && !!stored && $security.equal(given, stored);
}

function cleanQuestions(list) {
  if (!Array.isArray(list) || list.length < 1) fail("err.questions_required");
  if (list.length > LIMITS.questions) fail("err.too_many_questions");
  const seen = {};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!isObj(q)) fail("err.invalid_question");
    let id = typeof q.id === "string" && ID_RE.test(q.id) ? q.id : "";
    if (!id || seen[id]) id = $security.randomStringWithAlphabet(8, ALNUM);
    seen[id] = true;
    const c = { id: id, type: q.type, label: cleanStr(q.label, "question_label", true), required: q.required === true };
    if (q.type === "choice") {
      c.options = uniqueStrings(q.options, "option");
      if (c.options.length < LIMITS.options_min) fail("err.options_min");
      if (c.options.length > LIMITS.options) fail("err.too_many_options");
      c.multi = q.multi === true;
    } else if (q.type === "schedule") {
      c.slots = uniqueStrings(q.slots, "option");
      for (let j = 0; j < c.slots.length; j++) if (!validSlot(c.slots[j])) fail("err.invalid_date");
      if (c.slots.length < 1) fail("err.slots_min");
      if (c.slots.length > LIMITS.slots) fail("err.too_many_slots");
      c.slots.sort();
      c.maybe = q.maybe !== false;
    } else if (q.type !== "text") {
      fail("err.invalid_question");
    }
    out.push(c);
  }
  return out;
}

function cleanSettings(s) {
  s = isObj(s) ? s : {};
  return {
    results: RESULTS.indexOf(s.results) >= 0 ? s.results : "always",
    allow_edit: s.allow_edit !== false,
    require_login: s.require_login === true,
  };
}

function cleanFinal(questions, f) {
  const out = {};
  if (!isObj(f)) return out;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.type === "schedule" && typeof f[q.id] === "string" && q.slots.indexOf(f[q.id]) >= 0) out[q.id] = f[q.id];
  }
  return out;
}

// Normalizes answers against the question definitions. Schedule answers only
// store "yes"/"maybe"; a missing slot means "no".
function cleanAnswers(questions, a) {
  if (!isObj(a)) a = {};
  const out = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const v = a[q.id];
    if (q.type === "choice") {
      const picked = [];
      if (Array.isArray(v)) {
        for (let j = 0; j < v.length; j++) {
          if (q.options.indexOf(v[j]) >= 0 && picked.indexOf(v[j]) < 0) picked.push(v[j]);
        }
      }
      if (!q.multi && picked.length > 1) fail("err.single_choice");
      if (q.required && !picked.length) fail("err.answer_required");
      if (picked.length) out[q.id] = picked;
    } else if (q.type === "schedule") {
      const o = {};
      let n = 0;
      if (isObj(v)) {
        for (let j = 0; j < q.slots.length; j++) {
          const x = v[q.slots[j]];
          if (x === "yes" || (x === "maybe" && q.maybe)) {
            o[q.slots[j]] = x;
            n++;
          }
        }
      }
      if (q.required && !n) fail("err.answer_required");
      out[q.id] = o;
    } else {
      const s = cleanStr(v, "text", false);
      if (q.required && !s) fail("err.answer_required");
      if (s) out[q.id] = s;
    }
  }
  return out;
}

// Applies (partial) survey fields from a request body to a record.
function applySurvey(rec, body, isNew) {
  if (isNew || "title" in body) rec.set("title", cleanStr(body.title, "title", true));
  if (isNew || "description" in body) rec.set("description", cleanStr(body.description, "description", false));
  if (isNew || "settings" in body) rec.set("settings", cleanSettings(body.settings));
  if (isNew || "questions" in body) rec.set("questions", cleanQuestions(body.questions));
  if ("closes_at" in body) {
    if (!body.closes_at) {
      rec.set("closes_at", "");
    } else {
      const d = new Date(body.closes_at);
      if (typeof body.closes_at !== "string" || isNaN(d.getTime())) fail("err.invalid_date");
      rec.set("closes_at", d.toISOString());
    }
  }
  if ("closed" in body) rec.set("closed", body.closed === true);
  if (isNew || "final" in body || "questions" in body) {
    const f = "final" in body ? body.final : readJSON(rec, "final", {});
    rec.set("final", cleanFinal(readJSON(rec, "questions", []), f));
  }
}

function isClosed(rec) {
  if (rec.getBool("closed")) return true;
  const c = isoDate(rec.getString("closes_at"));
  return !!c && new Date(c).getTime() <= Date.now();
}

function findSurvey(id) {
  try {
    return $app.findRecordById("surveys", id);
  } catch (_) {
    throw new NotFoundError("err.not_found");
  }
}

function findResponse(id) {
  try {
    return $app.findRecordById("responses", id);
  } catch (_) {
    throw new NotFoundError("err.not_found");
  }
}

function surveyDTO(rec) {
  return {
    id: rec.id,
    title: rec.getString("title"),
    description: rec.getString("description"),
    questions: readJSON(rec, "questions", []),
    settings: cleanSettings(readJSON(rec, "settings", {})),
    final: readJSON(rec, "final", {}),
    closed: rec.getBool("closed"),
    closes_at: isoDate(rec.getString("closes_at")),
    is_closed: isClosed(rec),
    created: isoDate(rec.getString("created")),
  };
}

function responseDTO(rec) {
  return {
    id: rec.id,
    name: rec.getString("name"),
    account: rec.getString("user") !== "",
    comment: rec.getString("comment"),
    answers: readJSON(rec, "answers", {}),
    created: isoDate(rec.getString("created")),
  };
}

function maxResponses() {
  const n = parseInt($os.getenv("EVENTI_MAX_RESPONSES") || "100", 10);
  return n > 0 ? n : 100;
}

// Survey rules (see GLOSSARY.md) for the client: the same limits, settings and defaults this module
// validates with, so the browser never hard-codes them
function rulesDTO() {
  return {
    limits: Object.assign({ responses: maxResponses() }, LIMITS),
    results: RESULTS.slice(),
    defaults: cleanSettings({}),
  };
}

// Pushes a "changed" ping to realtime clients subscribed to "eventi:<surveyId>".
function notify(surveyId) {
  const topic = "eventi:" + surveyId;
  const msg = new SubscriptionMessage({ name: topic, data: JSON.stringify({ t: "changed" }) });
  const clients = $app.subscriptionsBroker().clients();
  for (let cid in clients) {
    if (clients[cid].hasSubscription(topic)) clients[cid].send(msg);
  }
}

// --- Accounts ---------------------------------------------------------------

const list = (name) => ($os.getenv(name) || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);

function mailEnabled() {
  return $app.settings().smtp.enabled;
}

// EVENTI_SIGNUP: any combination of invite, domain, approval, open (default: invite).
// Admins can always invite. "domain" needs working mail, since the address must be verified.
function signupConfig() {
  const modes = list("EVENTI_SIGNUP");
  const domains = list("EVENTI_SIGNUP_DOMAINS").map((d) => d.replace(/^@/, ""));
  const domain = modes.indexOf("domain") >= 0 && domains.length > 0 && mailEnabled();
  const open = modes.indexOf("open") >= 0;
  const approval = modes.indexOf("approval") >= 0;
  return { self: open || approval || domain, open: open, approval: approval, domains: domain ? domains : [] };
}

// Status for a self sign-up, or "" if not allowed
function signupStatus(email) {
  const c = signupConfig();
  const at = String(email || "").toLowerCase().lastIndexOf("@");
  const dom = at >= 0 ? String(email).toLowerCase().slice(at + 1) : "";
  if (c.open || (dom && c.domains.indexOf(dom) >= 0)) return "active";
  if (c.approval) return "pending";
  return "";
}

// Logged-in, active account or null. The status is checked on every request,
// so blocking a user takes effect immediately, not only when the token expires.
function currentUser(e) {
  const a = e.auth;
  if (!a || a.collection().name !== "users" || a.getString("status") !== "active") return null;
  return a;
}

function requireUser(e) {
  const u = currentUser(e);
  if (!u) throw new UnauthorizedError("err.login_required");
  return u;
}

function requireAdmin(e) {
  const u = requireUser(e);
  if (u.getString("role") !== "admin") throw new ForbiddenError("err.forbidden");
  return u;
}

function isOwner(e, survey) {
  const u = currentUser(e);
  return !!u && survey.getString("owner") === u.id;
}

// Survey management: secret admin link or owning account
function canAdmin(e, survey) {
  return checkKey(e.request.header.get("X-Admin-Key"), survey.getString("admin_key")) || isOwner(e, survey);
}

// Survey the request may manage (owner or admin link), or 404 / 403. surveyId defaults to the {id} route param.
function adminSurvey(e, surveyId) {
  const survey = findSurvey(surveyId || e.request.pathValue("id"));
  if (!canAdmin(e, survey)) throw new ForbiddenError("err.forbidden");
  return survey;
}

function displayName(u) {
  const n = u.getString("name").trim();
  return n || u.email().split("@")[0];
}

function userDTO(u) {
  return {
    id: u.id,
    email: u.email(),
    name: u.getString("name"),
    display_name: displayName(u),
    role: u.getString("role") || "user",
    status: u.getString("status") || "pending",
    verified: u.verified(),
    lang: u.getString("lang"),
    mail_opt_out: u.getBool("mail_opt_out"),
    created: isoDate(u.getString("created")),
  };
}

const LANGS = ["de", "en", "fr"];
function cleanLang(l) {
  return LANGS.indexOf(l) >= 0 ? l : "";
}

module.exports = {
  fail, readBody, readJSON, newKey, checkKey, cleanStr, cleanAnswers, applySurvey,
  isClosed, findSurvey, findResponse, surveyDTO, responseDTO, maxResponses, notify, isoDate, rulesDTO,
  mailEnabled, signupConfig, signupStatus, currentUser, requireUser, requireAdmin, isOwner, canAdmin, adminSurvey,
  displayName, userDTO, cleanLang,
};