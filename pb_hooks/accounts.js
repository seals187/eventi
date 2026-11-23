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

module.exports = { setup };
