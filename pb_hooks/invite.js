/// <reference path="../pb_data/types.d.ts" />

// Invitations per survey: personal links, "who has voted", reminders.
// Mails are queued on the record and sent by the cron job in notify.pb.js.

const MAX_PER_SURVEY = 200;
const MAX_PER_REQUEST = 50;
const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

const pbDate = (d) => d.toISOString().replace("T", " ");

function findUserByEmail(email) {
  try {
    return $app.findAuthRecordByEmail("users", email);
  } catch (_) {
    return null;
  }
}

// Valid invitation for this survey + token, or null
function byToken(surveyId, token) {
  if (!token || typeof token !== "string" || token.length < 20) return null;
  try {
    const inv = $app.findFirstRecordByFilter("invitations", "token = {:t} && survey = {:s}", { t: token, s: surveyId });
    const lib = require(`${__hooks}/lib.js`);
    return lib.checkKey(token, inv.getString("token")) ? inv : null;
  } catch (_) {
    return null;
  }
}

function fromRequest(e, surveyId) {
  return byToken(surveyId, e.request.header.get("X-Invite-Token"));
}

// Emails of accounts that answered this survey (lower case)
function accountEmails(surveyId) {
  const out = {};
  const rs = $app.findRecordsByFilter("responses", "survey = {:id} && user != ''", "", 0, 0, { id: surveyId });
  for (let i = 0; i < rs.length; i++) {
    try {
      out[$app.findRecordById("users", rs[i].getString("user")).email().toLowerCase()] = true;
    } catch (_) { /* deleted account */ }
  }
  return out;
}

function hasVoted(inv, emails) {
  if (inv.getString("response")) return true;
  return !!emails[inv.getString("email").toLowerCase()];
}

function dto(inv, emails) {
  const lib = require(`${__hooks}/lib.js`);
  return {
    id: inv.id,
    email: inv.getString("email"),
    name: inv.getString("name"),
    voted: hasVoted(inv, emails),
    invite_sent: lib.isoDate(inv.getString("invite_sent")),
    reminded_at: lib.isoDate(inv.getString("reminded_at")),
    remind_queued: !!inv.getString("remind_due"),
    created: lib.isoDate(inv.getString("created")),
  };
}

function list(survey) {
  const emails = accountEmails(survey.id);
  const recs = $app.findRecordsByFilter("invitations", "survey = {:id}", "created", 0, 0, { id: survey.id });
  return recs.map((r) => dto(r, emails));
}

// "Anna <anna@x.ch>, bob@y.ch; ..." -> [{email, name}]
function parse(text) {
  const out = [];
  const seen = {};
  const parts = String(text || "").split(/[\n,;]+/);
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i].trim();
    if (!p) continue;
    let name = "";
    const m = /^(.*)<([^>]+)>$/.exec(p);
    if (m) {
      name = m[1].trim().replace(/^"|"$/g, "");
      p = m[2].trim();
    }
    const email = p.toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return { error: email };
    if (seen[email]) continue;
    seen[email] = true;
    out.push({ email: email, name: name.slice(0, 60) });
  }
  return { items: out };
}

// Creates invitations (mails are queued). Returns { added, skipped }.
function add(survey, text) {
  const lib = require(`${__hooks}/lib.js`);
  if (!lib.mailEnabled()) lib.fail("err.mail_disabled");
  const parsed = parse(text);
  if (parsed.error !== undefined) lib.fail("err.invalid_email");
  if (!parsed.items.length) lib.fail("err.invalid_email");
  if (parsed.items.length > MAX_PER_REQUEST) lib.fail("err.too_many_invites");
  const existing = $app.countRecords("invitations", $dbx.hashExp({ survey: survey.id }));
  const col = $app.findCollectionByNameOrId("invitations");
  let added = 0, skipped = 0;
  for (let i = 0; i < parsed.items.length; i++) {
    const it = parsed.items[i];
    let dup = true;
    try {
      $app.findFirstRecordByFilter("invitations", "survey = {:s} && email = {:e}", { s: survey.id, e: it.email });
    } catch (_) {
      dup = false;
    }
    if (dup) {
      skipped++;
      continue;
    }
    if (existing + added >= MAX_PER_SURVEY) lib.fail("err.too_many_invites");
    const r = new Record(col);
    r.set("survey", survey.id);
    r.set("email", it.email);
    const u = findUserByEmail(it.email);
    r.set("name", it.name || (u ? lib.displayName(u) : ""));
    r.set("token", lib.newKey());
    $app.save(r);
    added++;
  }
  return { added: added, skipped: skipped };
}

// After a response was created: link it to the invitation (personal link or account email)
function linkResponse(e, survey, response, user) {
  let inv = fromRequest(e, survey.id);
  if (!inv && user) {
    try {
      inv = $app.findFirstRecordByFilter("invitations", "survey = {:s} && email = {:e}", { s: survey.id, e: user.email().toLowerCase() });
    } catch (_) {
      inv = null;
    }
  }
  if (inv && !inv.getString("response")) {
    inv.set("response", response.id);
    inv.set("remind_due", "");
    $app.save(inv);
  }
}

// Queues a reminder for everyone who has not voted (and was not reminded in the last 12 h)
function queueReminders(survey, force) {
  const emails = accountEmails(survey.id);
  const recent = Date.now() - 12 * 3600000;
  const recs = $app.findRecordsByFilter("invitations", "survey = {:id} && invite_sent != ''", "", 0, 0, { id: survey.id });
  let n = 0;
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (hasVoted(r, emails) || r.getString("remind_due")) continue;
    const last = r.getString("reminded_at");
    if (!force && last) continue;
    // Automatic reminder: not for people who were only just invited
    if (!force && new Date(r.getString("invite_sent").replace(" ", "T")).getTime() > recent) continue;
    if (last && new Date(last.replace(" ", "T")).getTime() > recent) continue;
    r.set("remind_due", new Date().toISOString());
    $app.save(r);
    n++;
  }
  return n;
}

// --- mails (cron) ------------------------------------------------------------

const DOW = {
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  fr: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
};

// Closing time in the container's time zone (TZ)
function fmtDateTime(lang, iso) {
  const d = new Date(iso.replace(" ", "T"));
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const date = lang === "en"
    ? d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    : pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  return (DOW[lang] || DOW.de)[d.getDay()] + " " + date + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function recipientFor(inv, owner) {
  const mail = require(`${__hooks}/mail.js`);
  const u = findUserByEmail(inv.getString("email"));
  const lang = u && u.getString("lang") ? mail.langOf(u) : mail.langOf(owner);
  return { email: inv.getString("email"), name: inv.getString("name"), lang: lang, user: u };
}

function mailVars(survey, owner, inv, lang) {
  const lib = require(`${__hooks}/lib.js`);
  const mail = require(`${__hooks}/mail.js`);
  const closes = lib.isClosed(survey) ? "" : survey.getString("closes_at");
  const T = mail.T[lang] || mail.T.de;
  return {
    title: survey.getString("title"),
    inviter: owner ? lib.displayName(owner) : ($app.settings().meta.appName || "eventi"),
    desc_html: survey.getString("description") ? '<p style="white-space:pre-line;color:#6b6b78">' + mail.esc(survey.getString("description")) + "</p>" : "",
    closes_html: closes ? "<p>" + mail.esc(T.closes.replace("{date}", fmtDateTime(lang, closes))) + "</p>" : "",
    link: mail.url("s.html?id=" + survey.id + "#i=" + inv.getString("token")),
  };
}

function findSurveyOrNull(id) {
  try {
    return $app.findRecordById("surveys", id);
  } catch (_) {
    return null;
  }
}

function ownerOf(survey) {
  try {
    return survey.getString("owner") ? $app.findRecordById("users", survey.getString("owner")) : null;
  } catch (_) {
    return null;
  }
}

function sendInvitations() {
  const mail = require(`${__hooks}/mail.js`);
  const recs = $app.findRecordsByFilter("invitations", "invite_sent = ''", "created", 100, 0);
  for (let i = 0; i < recs.length; i++) {
    const inv = recs[i];
    inv.set("invite_sent", new Date().toISOString());
    $app.save(inv);
    const survey = findSurveyOrNull(inv.getString("survey"));
    if (!survey) continue;
    const owner = ownerOf(survey);
    const r = recipientFor(inv, owner);
    mail.send([r], "survey_invite", mailVars(survey, owner, inv, r.lang));
  }
}

// Automatic reminder: 24 h before closes_at, once per closing time
function scheduleAutoReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600000);
  const recs = $app.findRecordsByFilter("surveys",
    "closed = false && closes_at != '' && closes_at > {:now} && closes_at <= {:soon} && reminder_for != closes_at",
    "", 100, 0, { now: pbDate(now), soon: pbDate(soon) });
  for (let i = 0; i < recs.length; i++) {
    const s = recs[i];
    s.set("reminder_for", s.getString("closes_at"));
    $app.save(s);
    queueReminders(s, false);
  }
}

function sendReminders() {
  const lib = require(`${__hooks}/lib.js`);
  const mail = require(`${__hooks}/mail.js`);
  const recs = $app.findRecordsByFilter("invitations", "remind_due != '' && remind_due <= {:now}", "remind_due", 100, 0, { now: pbDate(new Date()) });
  const emailsBySurvey = {};
  for (let i = 0; i < recs.length; i++) {
    const inv = recs[i];
    inv.set("remind_due", "");
    const survey = findSurveyOrNull(inv.getString("survey"));
    if (!survey || lib.isClosed(survey)) {
      $app.save(inv);
      continue;
    }
    const sid = survey.id;
    if (!emailsBySurvey[sid]) emailsBySurvey[sid] = accountEmails(sid);
    if (hasVoted(inv, emailsBySurvey[sid])) {
      $app.save(inv);
      continue;
    }
    inv.set("reminded_at", new Date().toISOString());
    $app.save(inv);
    const owner = ownerOf(survey);
    const r = recipientFor(inv, owner);
    if (r.user && r.user.getBool("mail_opt_out")) continue;
    mail.send([r], "reminder", mailVars(survey, owner, inv, r.lang));
  }
}

module.exports = {
  byToken, fromRequest, list, add, linkResponse, queueReminders,
  sendInvitations, scheduleAutoReminders, sendReminders, fmtDateTime,
};
