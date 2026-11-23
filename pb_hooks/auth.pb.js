/// <reference path="../pb_data/types.d.ts" />

// Accounts: sign-up rules, login checks, localized system mails, account routes.
// Login itself uses PocketBase's standard endpoints:
//   POST /api/collections/users/auth-with-password  {identity, password}
//   POST /api/collections/users/request-otp         {email}  -> {otpId}
//   POST /api/collections/users/auth-with-otp       {otpId, password}
//   POST /api/collections/users/records             sign-up (gated below)
//   POST /api/collections/users/request-password-reset / confirm-password-reset
//   POST /api/collections/users/confirm-verification

// Self sign-up: allowed only according to EVENTI_SIGNUP; role and status are forced.
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const lib = require(`${__hooks}/lib.js`);
  const status = lib.signupStatus(e.record.email());
  if (!status) throw new ForbiddenError("err.signup_disabled");
  e.record.set("role", "user");
  e.record.set("status", status);
  e.record.set("verified", false);
  e.record.set("mail_opt_out", false);
  e.record.set("lang", lib.cleanLang(e.record.getString("lang")));
  e.record.set("name", String(e.record.getString("name")).trim().slice(0, 60));
  e.next();

  const mail = require(`${__hooks}/mail.js`);
  if (lib.mailEnabled()) {
    try {
      $mails.sendRecordVerification($app, e.record);
    } catch (err) {
      $app.logger().error("eventi verification mail failed", "error", String(err));
    }
  }
  if (status === "pending") {
    const admins = $app.findRecordsByFilter("users", "role = 'admin' && status = 'active'", "", 50, 0);
    mail.send(admins.map(mail.recipient), "pending", {
      name: lib.displayName(e.record), email: e.record.email(), link: mail.url("users.html"),
    });
  }
}, "users");

// Every login (password, code, token refresh) must belong to an active account.
// Password logins additionally need a verified address when mail is available
// (a code login proves the address by itself).
onRecordAuthRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const status = e.record.getString("status");
  if (status === "pending") throw new ForbiddenError("err.account_pending");
  if (status !== "active") throw new ForbiddenError("err.account_blocked");
  if (e.authMethod === "password" && !e.record.verified() && lib.mailEnabled()) throw new ForbiddenError("err.not_verified");
  e.next();
}, "users");

// A successful code login proves the address
onRecordAuthWithOTPRequest((e) => {
  if (e.record && !e.record.verified()) {
    e.record.setVerified(true);
    $app.save(e.record);
  }
  e.next();
}, "users");

// Localized system mails with links to our own pages instead of the dashboard
onMailerRecordOTPSend((e) => {
  const mail = require(`${__hooks}/mail.js`);
  mail.rewrite(e, "otp", { code: e.meta.password });
  e.next();
}, "users");

onMailerRecordVerificationSend((e) => {
  const mail = require(`${__hooks}/mail.js`);
  mail.rewrite(e, "verify", { link: mail.url("login.html#verify=" + e.meta.token) });
  e.next();
}, "users");

onMailerRecordPasswordResetSend((e) => {
  const mail = require(`${__hooks}/mail.js`);
  mail.rewrite(e, "reset", { link: mail.url("login.html#reset=" + e.meta.token) });
  e.next();
}, "users");

// --- Own account -------------------------------------------------------------

routerAdd("GET", "/api/eventi/me", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  return e.json(200, lib.userDTO(lib.requireUser(e)));
});

routerAdd("PATCH", "/api/eventi/me", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const u = lib.requireUser(e);
  const body = lib.readBody(e);
  if ("name" in body) u.set("name", lib.cleanStr(body.name, "name", false));
  if ("lang" in body) u.set("lang", lib.cleanLang(body.lang));
  if ("mail_opt_out" in body) u.set("mail_opt_out", body.mail_opt_out === true);
  $app.save(u);
  return e.json(200, lib.userDTO(u));
});

// Surveys owned by the logged-in user (incl. admin key, so admin links keep working)
routerAdd("GET", "/api/eventi/me/surveys", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const u = lib.requireUser(e);
  const recs = $app.findRecordsByFilter("surveys", "owner = {:id}", "-created", 200, 0, { id: u.id });
  return e.json(200, recs.map((r) => ({
    id: r.id,
    admin_key: r.getString("admin_key"),
    title: r.getString("title"),
    created: lib.isoDate(r.getString("created")),
    is_closed: lib.isClosed(r),
    count: $app.countRecords("responses", $dbx.hashExp({ survey: r.id })),
  })));
});

// --- User management (role admin) ----------------------------------------------

routerAdd("GET", "/api/eventi/users", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  lib.requireAdmin(e);
  const recs = $app.findRecordsByFilter("users", "", "status, email", 1000, 0);
  return e.json(200, recs.map((u) => {
    const dto = lib.userDTO(u);
    dto.surveys = $app.countRecords("surveys", $dbx.hashExp({ owner: u.id }));
    return dto;
  }));
});

// Invite: creates an active, verified account. With mail the person gets an
// invitation and signs in with a code; without mail the admin sets a password.
routerAdd("POST", "/api/eventi/users", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const mail = require(`${__hooks}/mail.js`);
  const admin = lib.requireAdmin(e);
  const body = lib.readBody(e);
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) lib.fail("err.invalid_email");
  let exists = true;
  try {
    $app.findAuthRecordByEmail("users", email);
  } catch (_) {
    exists = false;
  }
  if (exists) lib.fail("err.email_taken");
  const password = typeof body.password === "string" ? body.password : "";
  if (!lib.mailEnabled() && password.length < 8) lib.fail("err.password_short");
  if (password && password.length < 8) lib.fail("err.password_short");

  const u = new Record($app.findCollectionByNameOrId("users"));
  u.setEmail(email);
  u.setPassword(password || $security.randomString(40));
  u.set("name", lib.cleanStr(body.name, "name", false));
  u.set("role", body.role === "admin" ? "admin" : "user");
  u.set("status", "active");
  u.set("lang", lib.cleanLang(body.lang) || lib.cleanLang(admin.getString("lang")));
  u.setVerified(true);
  $app.save(u);

  const mailed = mail.send([mail.recipient(u)], "invite", {
    inviter: lib.displayName(admin), email: email, link: mail.url("login.html?mode=code&email=" + encodeURIComponent(email)),
  });
  const dto = lib.userDTO(u);
  dto.surveys = 0;
  dto.mailed = mailed > 0;
  return e.json(200, dto);
});

routerAdd("PATCH", "/api/eventi/users/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const mail = require(`${__hooks}/mail.js`);
  const admin = lib.requireAdmin(e);
  let u;
  try {
    u = $app.findRecordById("users", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("err.not_found");
  }
  const body = lib.readBody(e);
  const self = u.id === admin.id;
  const wasPending = u.getString("status") === "pending";
  if ("status" in body) {
    if (["active", "blocked"].indexOf(body.status) < 0) lib.fail("err.invalid_body");
    if (self && body.status !== "active") lib.fail("err.self_lockout");
    u.set("status", body.status);
    // Approving someone also confirms the address (an admin looked at it)
    if (body.status === "active") u.setVerified(true);
  }
  if ("role" in body) {
    if (["user", "admin"].indexOf(body.role) < 0) lib.fail("err.invalid_body");
    if (self && body.role !== "admin") lib.fail("err.self_lockout");
    u.set("role", body.role);
  }
  if ("name" in body) u.set("name", lib.cleanStr(body.name, "name", false));
  if ("password" in body) {
    if (typeof body.password !== "string" || body.password.length < 8) lib.fail("err.password_short");
    u.setPassword(body.password);
  }
  $app.save(u);
  if (wasPending && u.getString("status") === "active") {
    mail.send([mail.recipient(u)], "approved", { link: mail.url("login.html?email=" + encodeURIComponent(u.email())) });
  }
  const dto = lib.userDTO(u);
  dto.surveys = $app.countRecords("surveys", $dbx.hashExp({ owner: u.id }));
  return e.json(200, dto);
});

// Deleting an account deletes its surveys as well (incl. all responses)
routerAdd("DELETE", "/api/eventi/users/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const admin = lib.requireAdmin(e);
  let u;
  try {
    u = $app.findRecordById("users", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("err.not_found");
  }
  if (u.id === admin.id) lib.fail("err.self_lockout");
  $app.runInTransaction((tx) => {
    const surveys = tx.findRecordsByFilter("surveys", "owner = {:id}", "", 0, 0, { id: u.id });
    for (let i = 0; i < surveys.length; i++) tx.delete(surveys[i]);
    tx.delete(u);
  });
  return e.noContent(204);
});
