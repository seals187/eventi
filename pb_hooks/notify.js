/// <reference path="../pb_data/types.d.ts" />

// Notifications about a survey, delivered through the outbox (outbox.js):
//   digest – the owner gets one email summarising new responses (bundled per survey,
//            at most every EVENTI_DIGEST_MINUTES)
//   final  – participants with an account get the confirmed final date (bundled per survey,
//            1 minute delay, so undoing a misclick sends nothing)

function digestMinutes() {
  const n = parseInt($os.getenv("EVENTI_DIGEST_MINUTES") || "15", 10);
  return n >= 0 ? n : 15;
}

function findRecord(collection, id) {
  if (!id) return null;
  try {
    return $app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

// Called after a response was created
function responseAdded(survey, response) {
  const owner = survey.getString("owner");
  if (!owner || response.getString("user") === owner) return;
  require(`${__hooks}/outbox.js`).enqueue("digest", { survey: survey.id, since: new Date(Date.now() - 1000).toISOString() }, {
    dueAt: new Date(Date.now() + digestMinutes() * 60000),
    bundle: "digest:" + survey.id,
    bundleMode: "keep",
  });
}

// Called after a survey update; schedules an email when a final date was set or changed
function finalChanged(survey, before) {
  const lib = require(`${__hooks}/lib.js`);
  const after = lib.readJSON(survey, "final", {});
  let changed = false;
  for (const q in after) if (after[q] !== before[q]) changed = true;
  if (!changed) return;
  require(`${__hooks}/outbox.js`).enqueue("final", { survey: survey.id, before: before }, {
    dueAt: new Date(Date.now() + 60000),
    bundle: "final:" + survey.id,
    bundleMode: "replace",
    // Keep the state before the first change of the bundle
    merge: (old, nw) => ({ survey: nw.survey, before: old.before || nw.before }),
  });
}

const mailJobs = {
  digest(p) {
    const mail = require(`${__hooks}/mail.js`);
    const s = findRecord("surveys", p.survey);
    const owner = s && findRecord("users", s.getString("owner"));
    if (!owner) return { mails: [] };
    const since = String(p.since || "").replace("T", " ");
    const fresh = $app.findRecordsByFilter("responses", "survey = {:id} && created >= {:since} && user != {:owner}", "created", 50, 0,
      { id: s.id, since: since, owner: owner.id });
    if (!fresh.length) return { mails: [] };
    return {
      mails: [{
        to: mail.recipient(owner),
        key: "digest",
        vars: {
          title: s.getString("title"),
          count: $app.countRecords("responses", $dbx.hashExp({ survey: s.id })),
          names_html: mail.list(fresh.map((r) => r.getString("name"))),
          link: mail.url("a.html?id=" + s.id + "#k=" + s.getString("admin_key")),
        },
      }],
    };
  },

  final(p) {
    const lib = require(`${__hooks}/lib.js`);
    const mail = require(`${__hooks}/mail.js`);
    const s = findRecord("surveys", p.survey);
    if (!s) return { mails: [] };
    const final = lib.readJSON(s, "final", {});
    const before = p.before || {};
    const slots = [];
    const questions = lib.readJSON(s, "questions", []);
    for (let j = 0; j < questions.length; j++) {
      const q = questions[j];
      if (final[q.id] && final[q.id] !== before[q.id]) slots.push({ label: q.label, slot: final[q.id] });
    }
    if (!slots.length) return { mails: [] };
    const owner = s.getString("owner");
    const responses = $app.findRecordsByFilter("responses", "survey = {:id} && user != ''", "", 0, 0, { id: s.id });
    const mails = [];
    for (let j = 0; j < responses.length; j++) {
      const u = findRecord("users", responses[j].getString("user"));
      if (!u || u.id === owner) continue;
      const to = mail.recipient(u);
      mails.push({
        to: to,
        key: "final",
        vars: {
          title: s.getString("title"),
          slots_html: mail.list(slots.map((x) => (slots.length > 1 ? x.label + ": " : "") + require(`${__hooks}/locale.js`).fmtSlot(to.lang, x.slot))),
          link: mail.url("s.html?id=" + s.id),
        },
      });
    }
    return { mails: mails };
  },
};

module.exports = { responseAdded, finalChanged, mailJobs };
