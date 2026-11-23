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
    default_lang: require(`${__hooks}/locale.js`).defaultLang(),
    rules: lib.rulesDTO(),
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
  const p = require(`${__hooks}/participant.js`);
  const who = p.participant(e, rec);
  const records = $app.findRecordsByFilter("responses", "survey = {:id}", "created", 0, 0, { id: rec.id });
  const responses = records.map((r) => lib.responseDTO(r));

  return e.json(200, {
    survey: lib.surveyDTO(rec),
    admin: who.admin,
    owner: lib.isOwner(e, rec),
    admin_key: who.admin ? rec.getString("admin_key") : undefined,
    can_see_results: who.canSeeResults,
    count: responses.length,
    responses: who.canSeeResults ? responses : null,
    mine: who.response ? lib.responseDTO(who.response) : null,
    participant: p.participantDTO(who),
  });
});

routerAdd("PATCH", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.adminSurvey(e);
  const finalBefore = lib.readJSON(rec, "final", {});
  lib.applySurvey(rec, lib.readBody(e), false);
  $app.save(rec);
  lib.notify(rec.id);
  require(`${__hooks}/notify.js`).finalChanged(rec, finalBefore);
  return e.json(200, { survey: lib.surveyDTO(rec) });
});

routerAdd("DELETE", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.adminSurvey(e);
  $app.delete(rec);
  lib.notify(rec.id);
  return e.noContent(204);
});

routerAdd("POST", "/api/eventi/surveys/{id}/responses", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const survey = lib.findSurvey(e.request.pathValue("id"));
  const who = require(`${__hooks}/participant.js`).participant(e, survey);
  if (who.closed) lib.fail("err.closed");
  // A personal invitation link proves the address too, so it counts like a login
  if (who.mustLogin) throw new UnauthorizedError("err.login_required");
  if (who.response) lib.fail("err.already_voted");
  const count = $app.countRecords("responses", $dbx.hashExp({ survey: survey.id }));
  if (count >= lib.maxResponses()) lib.fail("err.max_responses");

  const body = lib.readBody(e);
  const rec = new Record($app.findCollectionByNameOrId("responses"));
  rec.set("survey", survey.id);
  // With mandatory login the account (or invitation) name is used, so nobody votes under someone else's name
  rec.set("name", who.nameIsFixed ? who.name() : lib.cleanStr(body.name, "name", true));
  rec.set("answers", lib.cleanAnswers(lib.readJSON(survey, "questions", []), body.answers));
  rec.set("comment", lib.cleanStr(body.comment, "comment", false));
  if (who.user) rec.set("user", who.user.id);
  const key = lib.newKey();
  rec.set("edit_key", key);
  $app.save(rec);
  require(`${__hooks}/invite.js`).linkResponse(survey, rec, who);
  lib.notify(survey.id);
  require(`${__hooks}/notify.js`).responseAdded(survey, rec);
  return e.json(200, { id: rec.id, edit_key: key });
});

routerAdd("PATCH", "/api/eventi/responses/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findResponse(e.request.pathValue("id"));
  const survey = lib.findSurvey(rec.getString("survey"));
  const who = require(`${__hooks}/participant.js`).participant(e, survey, { responseId: rec.id });
  if (!who.owns(rec)) throw new ForbiddenError("err.forbidden");
  if (who.closed) lib.fail("err.closed");
  if (!who.settings.allow_edit) lib.fail("err.edit_disabled");

  const body = lib.readBody(e);
  if ("name" in body && !who.settings.require_login) rec.set("name", lib.cleanStr(body.name, "name", true));
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
  const who = require(`${__hooks}/participant.js`).participant(e, survey, { responseId: rec.id });
  // Survey managers may always delete; participants only their own, while editing is allowed
  if (!who.admin) {
    if (!who.owns(rec)) throw new ForbiddenError("err.forbidden");
    if (who.closed) lib.fail("err.closed");
    if (!who.settings.allow_edit) lib.fail("err.edit_disabled");
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
