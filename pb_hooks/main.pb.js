/// <reference path="../pb_data/types.d.ts" />

// Public API under /api/eventi. Access:
//   Authorization  -> logged-in account (PocketBase auth token, users collection)
//   X-Admin-Key    -> survey management via secret admin link (returned on creation)
//   X-Edit-Key     -> participant editing their own response without an account
// Creating surveys requires an account; the owner can always manage their surveys.

routerAdd("GET", "/api/eventi/config", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const signup = lib.signupConfig();
  return e.json(200, {
    version: $os.getenv("EVENTI_VERSION") || "dev",
    default_lang: $os.getenv("EVENTI_DEFAULT_LANG") || "de",
    max_responses: lib.maxResponses(),
    mail: lib.mailEnabled(),
    signup: { self: signup.self, approval: signup.approval && !signup.open, domains: signup.domains },
  });
});

routerAdd("POST", "/api/eventi/surveys", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const user = lib.requireUser(e);
  const body = lib.readBody(e);
  const rec = new Record($app.findCollectionByNameOrId("surveys"));
  lib.applySurvey(rec, body, true);
  const key = lib.newKey();
  rec.set("admin_key", key);
  rec.set("owner", user.id);
  $app.save(rec);
  return e.json(200, { id: rec.id, admin_key: key });
});

routerAdd("GET", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findSurvey(e.request.pathValue("id"));
  const admin = lib.canAdmin(e, rec);
  const user = lib.currentUser(e);
  const invitation = require(`${__hooks}/invite.js`).fromRequest(e, rec.id);
  const records = $app.findRecordsByFilter("responses", "survey = {:id}", "created", 0, 0, { id: rec.id });

  const rid = e.request.header.get("X-Response-Id");
  const rkey = e.request.header.get("X-Edit-Key");
  const responses = [];
  let mine = null;
  for (let i = 0; i < records.length; i++) {
    const dto = lib.responseDTO(records[i]);
    const byKey = rid && dto.id === rid && lib.checkKey(rkey, records[i].getString("edit_key"));
    const byAccount = user && records[i].getString("user") === user.id;
    const byInvite = invitation && invitation.getString("response") === dto.id;
    if (byKey || byAccount || byInvite) mine = dto;
    responses.push(dto);
  }

  const survey = lib.surveyDTO(rec);
  const mode = survey.settings.results;
  const canSee = admin || mode === "always" || (mode === "after_vote" && (!!mine || survey.is_closed));

  return e.json(200, {
    survey: survey,
    admin: admin,
    owner: lib.isOwner(e, rec),
    admin_key: admin ? rec.getString("admin_key") : undefined,
    can_see_results: canSee,
    count: responses.length,
    responses: canSee ? responses : null,
    mine: mine,
    // Opened via a personal invitation link
    invitation: invitation ? { name: invitation.getString("name"), email: invitation.getString("email") } : null,
  });
});

routerAdd("PATCH", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findSurvey(e.request.pathValue("id"));
  if (!lib.canAdmin(e, rec)) throw new ForbiddenError("err.forbidden");
  const finalBefore = lib.readJSON(rec, "final", {});
  lib.applySurvey(rec, lib.readBody(e), false);
  $app.save(rec);
  lib.notify(rec.id);
  require(`${__hooks}/notify.js`).finalChanged(rec, finalBefore);
  return e.json(200, { survey: lib.surveyDTO(rec) });
});

routerAdd("DELETE", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findSurvey(e.request.pathValue("id"));
  if (!lib.canAdmin(e, rec)) throw new ForbiddenError("err.forbidden");
  $app.delete(rec);
  lib.notify(rec.id);
  return e.noContent(204);
});

routerAdd("POST", "/api/eventi/surveys/{id}/responses", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const survey = lib.findSurvey(e.request.pathValue("id"));
  if (lib.isClosed(survey)) lib.fail("err.closed");
  const settings = lib.surveyDTO(survey).settings;
  const invite = require(`${__hooks}/invite.js`);
  // A personal invitation link proves the address too, so it counts like a login
  const invitation = invite.fromRequest(e, survey.id);
  const user = settings.require_login && !invitation ? lib.requireUser(e) : lib.currentUser(e);
  const count = $app.countRecords("responses", $dbx.hashExp({ survey: survey.id }));
  if (count >= lib.maxResponses()) lib.fail("err.max_responses");
  if (user && $app.countRecords("responses", $dbx.hashExp({ survey: survey.id, user: user.id })) > 0) lib.fail("err.already_voted");
  if (invitation && invitation.getString("response")) lib.fail("err.already_voted");

  const body = lib.readBody(e);
  const rec = new Record($app.findCollectionByNameOrId("responses"));
  rec.set("survey", survey.id);
  // With mandatory login the account (or invitation) name is used, so nobody votes under someone else's name
  let name;
  if (!settings.require_login) name = lib.cleanStr(body.name, "name", true);
  else if (user) name = lib.displayName(user);
  else name = invitation.getString("name") || invitation.getString("email").split("@")[0];
  rec.set("name", name.slice(0, 60));
  rec.set("answers", lib.cleanAnswers(lib.readJSON(survey, "questions", []), body.answers));
  rec.set("comment", lib.cleanStr(body.comment, "comment", false));
  if (user) rec.set("user", user.id);
  const key = lib.newKey();
  rec.set("edit_key", key);
  $app.save(rec);
  invite.linkResponse(e, survey, rec, user);
  lib.notify(survey.id);
  require(`${__hooks}/notify.js`).responseAdded(survey, rec);
  return e.json(200, { id: rec.id, edit_key: key });
});

routerAdd("PATCH", "/api/eventi/responses/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findResponse(e.request.pathValue("id"));
  if (!lib.ownsResponse(e, rec)) throw new ForbiddenError("err.forbidden");
  const survey = lib.findSurvey(rec.getString("survey"));
  if (lib.isClosed(survey)) lib.fail("err.closed");
  const settings = lib.surveyDTO(survey).settings;
  if (!settings.allow_edit) lib.fail("err.edit_disabled");

  const body = lib.readBody(e);
  if ("name" in body && !settings.require_login) rec.set("name", lib.cleanStr(body.name, "name", true));
  if ("answers" in body) rec.set("answers", lib.cleanAnswers(lib.readJSON(survey, "questions", []), body.answers));
  if ("comment" in body) rec.set("comment", lib.cleanStr(body.comment, "comment", false));
  $app.save(rec);
  lib.notify(survey.id);
  return e.json(200, lib.responseDTO(rec));
});

routerAdd("DELETE", "/api/eventi/responses/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findResponse(e.request.pathValue("id"));
  const survey = lib.findSurvey(rec.getString("survey"));
  if (!lib.canAdmin(e, survey)) {
    if (!lib.ownsResponse(e, rec)) throw new ForbiddenError("err.forbidden");
    if (lib.isClosed(survey)) lib.fail("err.closed");
    if (!lib.surveyDTO(survey).settings.allow_edit) lib.fail("err.edit_disabled");
  }
  $app.delete(rec);
  lib.notify(survey.id);
  return e.noContent(204);
});

// Optional cleanup of inactive surveys (EVENTI_RETENTION_DAYS > 0).
cronAdd("eventiCleanup", "30 3 * * *", () => {
  const days = parseInt($os.getenv("EVENTI_RETENTION_DAYS") || "0", 10);
  if (!(days > 0)) return;
  const cutoff = new Date(Date.now() - days * 86400000);
  const cutoffStr = cutoff.toISOString().replace("T", " ");
  const old = $app.findRecordsByFilter("surveys", "updated < {:c}", "", 500, 0, { c: cutoffStr });
  for (let i = 0; i < old.length; i++) {
    const recent = $app.findRecordsByFilter("responses", "survey = {:id} && updated >= {:c}", "", 1, 0, { id: old[i].id, c: cutoffStr });
    if (!recent.length) $app.delete(old[i]);
  }
});
