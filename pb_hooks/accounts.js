/// <reference path="../pb_data/types.d.ts" />

// Applies account settings from .env and ensures the eventi admin account.
// Called on every start (settings.pb.js) and once by the users migration.
function setup(app) {
  const env = (name) => $os.getenv(name) || "";
  const days = parseInt(env("EVENTI_SESSION_DAYS"), 10);

  // Login with a one-time code by mail only makes sense if mails can be sent
  const users = app.findCollectionByNameOrId("users");
  users.otp.enabled = app.settings().smtp.enabled;
  users.authToken.duration = (days > 0 ? days : 30) * 86400;
  app.save(users);

  // eventi admin account = PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (same as the dashboard superuser).
  // The password is only set when the account is created, so it can be changed in the app afterwards.
  const email = env("PB_ADMIN_EMAIL").trim().toLowerCase();
  const pass = env("PB_ADMIN_PASSWORD");
  if (!email) return;
  let admin = null;
  try {
    admin = app.findAuthRecordByEmail("users", email);
  } catch (_) {
    if (!pass) return;
    admin = new Record(users);
    admin.setEmail(email);
    admin.setPassword(pass);
    admin.set("name", "Admin");
  }
  admin.set("role", "admin");
  admin.set("status", "active");
  admin.setVerified(true);
  app.save(admin);
}


function findUser(id) {
  if (!id) return null;
  try {
    return $app.findRecordById("users", id);
  } catch (_) {
    return null;
  }
}

// Account emails, delivered by the outbox (outbox.js)
const mailJobs = {
  // To all active admins: a sign-up is waiting for approval
  signup_pending(p) {
    const lib = require(`${__hooks}/lib.js`);
    const mail = require(`${__hooks}/mail.js`);
    const u = findUser(p.user);
    if (!u || u.getString("status") !== "pending") return { mails: [] };
    const admins = $app.findRecordsByFilter("users", "role = 'admin' && status = 'active'", "", 50, 0);
    return {
      mails: admins.map((a) => ({
        to: mail.recipient(a),
        key: "pending",
        vars: { name: lib.displayName(u), email: u.email(), link: mail.url("users.html") },
      })),
    };
  },

  // Invited people have no password yet, so the link opens the code login
  account_invite(p) {
    const lib = require(`${__hooks}/lib.js`);
    const mail = require(`${__hooks}/mail.js`);
    const u = findUser(p.user);
    if (!u) return { mails: [] };
    const inviter = findUser(p.inviter);
    return {
      mails: [{
        to: mail.recipient(u),
        key: "invite",
        vars: {
          inviter: inviter ? lib.displayName(inviter) : ($app.settings().meta.appName || "eventi"),
          email: u.email(),
          link: mail.url("login.html?mode=code&email=" + encodeURIComponent(u.email())),
        },
      }],
    };
  },

  account_approved(p) {
    const mail = require(`${__hooks}/mail.js`);
    const u = findUser(p.user);
    if (!u) return { mails: [] };
    return { mails: [{ to: mail.recipient(u), key: "approved", vars: { link: mail.url("login.html?email=" + encodeURIComponent(u.email())) } }] };
  },
};

module.exports = { setup, mailJobs };
