/// <reference path="../pb_data/types.d.ts" />

// Invitations per survey: personal links, "who has voted", reminders.
// Emails (invitation, reminder) are jobs in the outbox (outbox.js).

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
    remind_queued: require(`${__hooks}/outbox.js`).isPending("reminder:" + inv.id),
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

// Creates invitations; their emails go through the outbox. Returns { added, skipped }.
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
    require(`${__hooks}/outbox.js`).enqueue("survey_invite", { invitation: r.id });
    added++;
  }
  return { added: added, skipped: skipped };
}

// After a response was created: link it to the participant's invitation
// (personal link, or an invitation to the account's email address)
function linkResponse(survey, response, who) {
  let inv = who.invitation;
  const user = who.user;
  if (!inv && user) {
    try {
      inv = $app.findFirstRecordByFilter("invitations", "survey = {:s} && email = {:e}", { s: survey.id, e: user.email().toLowerCase() });
    } catch (_) {
      inv = null;
    }
  }
  if (inv && !inv.getString("response")) {
    inv.set("response", response.id);
    $app.save(inv);
  }
}

// Queues a reminder for everyone who has not voted (and was not reminded in the last 12 h).
// Returns the number of newly queued reminders.
function queueReminders(survey, force) {
  const outbox = require(`${__hooks}/outbox.js`);
  const emails = accountEmails(survey.id);
  const recent = Date.now() - 12 * 3600000;
  const recs = $app.findRecordsByFilter("invitations", "survey = {:id} && invite_sent != ''", "", 0, 0, { id: survey.id });
  let n = 0;
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (hasVoted(r, emails)) continue;
    const last = r.getString("reminded_at");
    if (!force && last) continue;
    // Automatic reminder: not for people who were only just invited
    if (!force && new Date(r.getString("invite_sent").replace(" ", "T")).getTime() > recent) continue;
    if (last && new Date(last.replace(" ", "T")).getTime() > recent) continue;
    const q = outbox.enqueue("reminder", { invitation: r.id }, { bundle: "reminder:" + r.id, bundleMode: "keep" });
    if (q && q.created) n++;
  }
  return n;
}

// Cron: surveys closing within 24 h get their automatic reminder, once per closing time
function scheduleAutoReminders() {
  const outbox = require(`${__hooks}/outbox.js`);
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600000);
  const recs = $app.findRecordsByFilter("surveys", "closed = false && closes_at != '' && closes_at > {:now} && closes_at <= {:soon}",
    "", 200, 0, { now: pbDate(now), soon: pbDate(soon) });
  for (let i = 0; i < recs.length; i++) {
    const s = recs[i];
    outbox.enqueue("auto_reminders", { survey: s.id }, { bundle: autoReminderBundle(s), bundleMode: "once" });
  }
}

const autoReminderBundle = (survey) => "auto-reminder:" + survey.id + ":" + survey.getString("closes_at");

// --- emails (delivered by the outbox) ----------------------------------------------

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

// Invited person as recipient: their account's language if they have one, else the owner's
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

function findRecord(collection, id) {
  if (!id) return null;
  try {
    return $app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

// Invitation and its survey/owner, or null if either is gone
function invitationContext(id) {
  const inv = findRecord("invitations", id);
  const survey = inv && findRecord("surveys", inv.getString("survey"));
  if (!survey) return null;
  return { inv: inv, survey: survey, owner: findRecord("users", survey.getString("owner")) };
}

const mailJobs = {
  survey_invite(p) {
    const c = invitationContext(p.invitation);
    if (!c) return { mails: [] };
    const to = recipientFor(c.inv, c.owner);
    return {
      mails: [{ to: to, key: "survey_invite", vars: mailVars(c.survey, c.owner, c.inv, to.lang) }],
      done: () => {
        c.inv.set("invite_sent", new Date().toISOString());
        $app.save(c.inv);
      },
    };
  },

  reminder(p) {
    const lib = require(`${__hooks}/lib.js`);
    const c = invitationContext(p.invitation);
    if (!c || lib.isClosed(c.survey) || hasVoted(c.inv, accountEmails(c.survey.id))) return { mails: [] };
    const to = recipientFor(c.inv, c.owner);
    return {
      mails: [{ to: to, key: "reminder", vars: mailVars(c.survey, c.owner, c.inv, to.lang) }],
      done: () => {
        c.inv.set("reminded_at", new Date().toISOString());
        $app.save(c.inv);
      },
    };
  },

  // Queues the individual reminders when the automatic reminder is due
  auto_reminders(p) {
    const lib = require(`${__hooks}/lib.js`);
    const s = findRecord("surveys", p.survey);
    if (s && !lib.isClosed(s)) queueReminders(s, false);
    return { mails: [] };
  },
};

module.exports = {
  list, add, linkResponse, queueReminders, scheduleAutoReminders, mailJobs, fmtDateTime,
};
