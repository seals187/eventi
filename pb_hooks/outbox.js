/// <reference path="../pb_data/types.d.ts" />

// Outbox: the emails eventi owes someone (see GLOSSARY.md). Domain code only calls
//   enqueue(kind, payload, opts)   – an email job due at some time (optionally bundled)
//   sendNow(kind, payload)         – same, but delivered right away (with retries if that fails)
// and the cron job calls runDue(). A job's kind names a handler (mailJobs[kind] in the module
// listed in HANDLERS) that decides, at send time, who gets which email; so a reminder to
// someone who has voted in the meantime simply produces no email.
//
// Bundles: jobs with the same bundle key are merged –
//   "keep"    an existing pending job wins (digest: first due time, first "since")
//   "replace" the pending job gets the new due time; opts.merge(old, new) builds the payload
//   "once"    only ever one job for this key, whatever its status (automatic reminders)
//
// Failed deliveries are retried after 1, 5 and 30 minutes, then the job is "failed"
// (visible in the PocketBase dashboard). Sent and failed jobs are deleted after 30 days.

const HANDLERS = {
  digest: "notify.js",
  final: "notify.js",
  survey_invite: "invite.js",
  reminder: "invite.js",
  auto_reminders: "invite.js",
  signup_pending: "accounts.js",
  account_invite: "accounts.js",
  account_approved: "accounts.js",
};
const RETRY_MINUTES = [1, 5, 30];
const KEEP_DAYS = 30;

const pbDate = (d) => d.toISOString().replace("T", " ");

function mailEnabled() {
  return $app.settings().smtp.enabled;
}

function findOne(filter, params) {
  try {
    return $app.findFirstRecordByFilter("outbox", filter, params);
  } catch (_) {
    return null;
  }
}

function readPayload(row) {
  try {
    return JSON.parse(row.getString("payload") || "{}") || {};
  } catch (_) {
    return {};
  }
}

// Returns { row, created } or null when no mail server is configured
function enqueue(kind, payload, opts) {
  opts = opts || {};
  if (!HANDLERS[kind]) throw new Error("outbox: unknown kind " + kind);
  if (!mailEnabled()) return null;
  const dueAt = opts.dueAt || new Date();
  const bundle = opts.bundle || "";

  if (bundle) {
    const mode = opts.bundleMode || "keep";
    const existing = mode === "once"
      ? findOne("bundle = {:b}", { b: bundle })
      : findOne("bundle = {:b} && status = 'pending'", { b: bundle });
    if (existing && mode !== "replace") return { row: existing, created: false };
    if (existing) {
      existing.set("payload", opts.merge ? opts.merge(readPayload(existing), payload) : payload);
      existing.set("due_at", dueAt.toISOString());
      $app.save(existing);
      return { row: existing, created: false };
    }
  }

  const row = new Record($app.findCollectionByNameOrId("outbox"));
  row.set("kind", kind);
  row.set("bundle", bundle);
  row.set("payload", payload || {});
  row.set("due_at", dueAt.toISOString());
  row.set("status", "pending");
  row.set("attempts", 0);
  $app.save(row);
  return { row: row, created: true };
}

// One rule for every email: accounts only while active and not opted out;
// people without an account (invitations) always
function eligible(to) {
  if (!to || !to.email) return false;
  const u = to.user;
  if (!u) return true;
  return u.getString("status") === "active" && !u.getBool("mail_opt_out");
}

// Delivers one job. Returns "sent", "retry" or "failed".
function run(row) {
  const mail = require(`${__hooks}/mail.js`);
  row.set("status", "sending");
  $app.save(row);

  const payload = readPayload(row);
  const done = payload._sent || [];
  let error = "";
  try {
    const job = require(`${__hooks}/${HANDLERS[row.getString("kind")]}`).mailJobs[row.getString("kind")](payload) || {};
    const mails = job.mails || [];
    for (let i = 0; i < mails.length; i++) {
      const m = mails[i];
      if (!eligible(m.to) || done.indexOf(m.to.email) >= 0) continue;
      try {
        mail.deliver(m.to, m.key, m.vars);
        done.push(m.to.email);
      } catch (err) {
        error = String(err);
      }
    }
    if (!error && job.done) job.done();
  } catch (err) {
    error = String(err);
  }

  if (!error) {
    row.set("status", "sent");
    row.set("sent_at", new Date().toISOString());
    row.set("last_error", "");
    $app.save(row);
    return "sent";
  }
  // Remember who already got it, so a retry does not send twice
  payload._sent = done;
  row.set("payload", payload);
  const attempts = row.getInt("attempts") + 1;
  row.set("attempts", attempts);
  row.set("last_error", error.slice(0, 500));
  $app.logger().error("eventi outbox delivery failed", "kind", row.getString("kind"), "attempt", attempts, "error", error);
  if (attempts > RETRY_MINUTES.length) {
    row.set("status", "failed");
    $app.save(row);
    return "failed";
  }
  row.set("status", "pending");
  row.set("due_at", new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60000).toISOString());
  $app.save(row);
  return "retry";
}

// Delivers all due jobs (opts.all: also jobs not due yet – tests and emergencies)
function runDue(opts) {
  opts = opts || {};
  // Without a mail server jobs stay pending until one is configured
  if (!mailEnabled()) return { sent: 0, retry: 0, failed: 0 };
  const filter = opts.all ? "status = 'pending'" : "status = 'pending' && due_at <= {:now}";
  const rows = $app.findRecordsByFilter("outbox", filter, "due_at", 200, 0, { now: pbDate(new Date()) });
  const result = { sent: 0, retry: 0, failed: 0 };
  for (let i = 0; i < rows.length; i++) result[run(rows[i])]++;
  return result;
}

// Enqueue and deliver immediately (for emails a person is waiting for)
function sendNow(kind, payload) {
  const q = enqueue(kind, payload);
  if (!q) return "disabled";
  return run(q.row);
}

function isPending(bundle) {
  return !!findOne("bundle = {:b} && status = 'pending'", { b: bundle });
}

function cleanup() {
  const cutoff = pbDate(new Date(Date.now() - KEEP_DAYS * 86400000));
  const old = $app.findRecordsByFilter("outbox", "(status = 'sent' || status = 'failed') && updated < {:c}", "", 1000, 0, { c: cutoff });
  for (let i = 0; i < old.length; i++) $app.delete(old[i]);
  return old.length;
}

module.exports = { enqueue, sendNow, runDue, isPending, cleanup, eligible };
