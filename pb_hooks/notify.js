/// <reference path="../pb_data/types.d.ts" />

// Mail notifications. Requests only mark work as due (fields on the survey);
// the cron job in notify.pb.js sends the mails, so a slow SMTP server never
// delays voting and quick changes are bundled.
//
//   digest_due / digest_since  -> owner gets a summary of new responses
//   final_due / final_notified -> participants with an account get the final date

const DOW = {
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  fr: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
};

const pbDate = (d) => d.toISOString().replace("T", " ");

function digestMinutes() {
  const n = parseInt($os.getenv("EVENTI_DIGEST_MINUTES") || "15", 10);
  return n >= 0 ? n : 15;
}

// "2026-12-05T18:00" -> "Sa 05.12.2026, 18:00" / "Sat 2026-12-05, 18:00"
function fmtSlot(lang, slot) {
  const mail = require(`${__hooks}/mail.js`);
  const p = slot.split("T");
  const ymd = p[0].split("-").map(Number);
  const dow = (DOW[lang] || DOW.de)[new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2])).getUTCDay()];
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const date = lang === "en" ? p[0] : pad(ymd[2]) + "." + pad(ymd[1]) + "." + ymd[0];
  return dow + " " + date + ", " + (p[1] || (mail.T[lang] || mail.T.de).allday);
}

function wantsMail(u) {
  return !!u && u.getString("status") === "active" && !u.getBool("mail_opt_out");
}

function findUser(id) {
  if (!id) return null;
  try {
    return $app.findRecordById("users", id);
  } catch (_) {
    return null;
  }
}

// Called after a response was created
function responseAdded(survey, response) {
  const owner = survey.getString("owner");
  if (!owner || response.getString("user") === owner || !$app.settings().smtp.enabled) return;
  if (survey.getString("digest_due")) return;
  survey.set("digest_due", new Date(Date.now() + digestMinutes() * 60000).toISOString());
  survey.set("digest_since", new Date(Date.now() - 1000).toISOString());
  $app.save(survey);
}

// Called after a survey update; schedules a mail when a final date was set or changed
function finalChanged(survey, before) {
  const lib = require(`${__hooks}/lib.js`);
  const after = lib.readJSON(survey, "final", {});
  let changed = false;
  for (const q in after) if (after[q] !== before[q]) changed = true;
  if (!changed || !$app.settings().smtp.enabled || survey.getString("final_due")) return;
  // Short delay: undoing a misclick within a minute sends nothing
  survey.set("final_due", new Date(Date.now() + 60000).toISOString());
  $app.save(survey);
}

function sendDigests() {
  const lib = require(`${__hooks}/lib.js`);
  const mail = require(`${__hooks}/mail.js`);
  const due = $app.findRecordsByFilter("surveys", "digest_due != '' && digest_due <= {:now}", "digest_due", 100, 0, { now: pbDate(new Date()) });
  for (let i = 0; i < due.length; i++) {
    const s = due[i];
    const since = s.getString("digest_since");
    // Claim first, so an overlapping run cannot send twice
    s.set("digest_due", "");
    s.set("digest_since", "");
    $app.save(s);

    const owner = findUser(s.getString("owner"));
    if (!wantsMail(owner)) continue;
    const fresh = $app.findRecordsByFilter("responses", "survey = {:id} && created >= {:since} && user != {:owner}", "created", 50, 0,
      { id: s.id, since: since, owner: owner.id });
    if (!fresh.length) continue;
    const names = fresh.map((r) => r.getString("name"));
    mail.send([mail.recipient(owner)], "digest", {
      title: s.getString("title"),
      count: $app.countRecords("responses", $dbx.hashExp({ survey: s.id })),
      names_html: mail.list(names),
      link: mail.url("a.html?id=" + s.id + "#k=" + s.getString("admin_key")),
    });
  }
}

function sendFinals() {
  const lib = require(`${__hooks}/lib.js`);
  const mail = require(`${__hooks}/mail.js`);
  const due = $app.findRecordsByFilter("surveys", "final_due != '' && final_due <= {:now}", "final_due", 100, 0, { now: pbDate(new Date()) });
  for (let i = 0; i < due.length; i++) {
    const s = due[i];
    const final = lib.readJSON(s, "final", {});
    const before = lib.readJSON(s, "final_notified", {});
    s.set("final_due", "");
    s.set("final_notified", final);
    $app.save(s);

    const slots = [];
    const questions = lib.readJSON(s, "questions", []);
    for (let j = 0; j < questions.length; j++) {
      const q = questions[j];
      if (final[q.id] && final[q.id] !== before[q.id]) slots.push({ label: q.label, slot: final[q.id] });
    }
    if (!slots.length) continue;

    const responses = $app.findRecordsByFilter("responses", "survey = {:id} && user != ''", "", 0, 0, { id: s.id });
    const owner = s.getString("owner");
    const recipients = [];
    for (let j = 0; j < responses.length; j++) {
      const u = findUser(responses[j].getString("user"));
      if (u && u.id !== owner && wantsMail(u)) recipients.push(Object.assign(mail.recipient(u), { user: u }));
    }
    mail.send(recipients, "final", (r) => ({
      title: s.getString("title"),
      slots_html: mail.list(slots.map((x) => (slots.length > 1 ? x.label + ": " : "") + fmtSlot(r.lang, x.slot))),
      link: mail.url("s.html?id=" + s.id),
    }));
  }
}

module.exports = { responseAdded, finalChanged, sendDigests, sendFinals, fmtSlot };
