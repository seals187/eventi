/// <reference path="../pb_data/types.d.ts" />

// Public API under /api/eventi. Auth works via secret keys sent as headers:
//   X-Admin-Key  -> survey owner (returned once on creation)
//   X-Edit-Key   -> participant editing their own response

routerAdd("GET", "/api/eventi/config", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  return e.json(200, {
    default_lang: $os.getenv("EVENTI_DEFAULT_LANG") || "de",
    max_responses: lib.maxResponses(),
  });
});

routerAdd("POST", "/api/eventi/surveys", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = lib.readBody(e);
  const rec = new Record($app.findCollectionByNameOrId("surveys"));
  lib.applySurvey(rec, body, true);
  const key = lib.newKey();
  rec.set("admin_key", key);
  $app.save(rec);
  return e.json(200, { id: rec.id, admin_key: key });
});

routerAdd("GET", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findSurvey(e.request.pathValue("id"));
  const admin = lib.checkKey(e.request.header.get("X-Admin-Key"), rec.getString("admin_key"));
  const records = $app.findRecordsByFilter("responses", "survey = {:id}", "created", 0, 0, { id: rec.id });

  const rid = e.request.header.get("X-Response-Id");
  const rkey = e.request.header.get("X-Edit-Key");
  const responses = [];
  let mine = null;
  for (let i = 0; i < records.length; i++) {
    const dto = lib.responseDTO(records[i]);
    if (rid && dto.id === rid && lib.checkKey(rkey, records[i].getString("edit_key"))) mine = dto;
    responses.push(dto);
  }

  const survey = lib.surveyDTO(rec);
  const mode = survey.settings.results;
  const canSee = admin || mode === "always" || (mode === "after_vote" && (!!mine || survey.is_closed));

  return e.json(200, {
    survey: survey,
    admin: admin,
    can_see_results: canSee,
    count: responses.length,
    responses: canSee ? responses : null,
    mine: mine,
  });
});

routerAdd("PATCH", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findSurvey(e.request.pathValue("id"));
  if (!lib.checkKey(e.request.header.get("X-Admin-Key"), rec.getString("admin_key"))) throw new ForbiddenError("err.forbidden");
  lib.applySurvey(rec, lib.readBody(e), false);
  $app.save(rec);
  lib.notify(rec.id);
  return e.json(200, { survey: lib.surveyDTO(rec) });
});

routerAdd("DELETE", "/api/eventi/surveys/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findSurvey(e.request.pathValue("id"));
  if (!lib.checkKey(e.request.header.get("X-Admin-Key"), rec.getString("admin_key"))) throw new ForbiddenError("err.forbidden");
  $app.delete(rec);
  lib.notify(rec.id);
  return e.noContent(204);
});

routerAdd("POST", "/api/eventi/surveys/{id}/responses", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const survey = lib.findSurvey(e.request.pathValue("id"));
  if (lib.isClosed(survey)) lib.fail("err.closed");
  const count = $app.countRecords("responses", $dbx.hashExp({ survey: survey.id }));
  if (count >= lib.maxResponses()) lib.fail("err.max_responses");

  const body = lib.readBody(e);
  const rec = new Record($app.findCollectionByNameOrId("responses"));
  rec.set("survey", survey.id);
  rec.set("name", lib.cleanStr(body.name, "name", true));
  rec.set("answers", lib.cleanAnswers(lib.readJSON(survey, "questions", []), body.answers));
  const key = lib.newKey();
  rec.set("edit_key", key);
  $app.save(rec);
  lib.notify(survey.id);
  return e.json(200, { id: rec.id, edit_key: key });
});

routerAdd("PATCH", "/api/eventi/responses/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findResponse(e.request.pathValue("id"));
  if (!lib.checkKey(e.request.header.get("X-Edit-Key"), rec.getString("edit_key"))) throw new ForbiddenError("err.forbidden");
  const survey = lib.findSurvey(rec.getString("survey"));
  if (lib.isClosed(survey)) lib.fail("err.closed");
  if (!lib.surveyDTO(survey).settings.allow_edit) lib.fail("err.edit_disabled");

  const body = lib.readBody(e);
  if ("name" in body) rec.set("name", lib.cleanStr(body.name, "name", true));
  if ("answers" in body) rec.set("answers", lib.cleanAnswers(lib.readJSON(survey, "questions", []), body.answers));
  $app.save(rec);
  lib.notify(survey.id);
  return e.json(200, lib.responseDTO(rec));
});

routerAdd("DELETE", "/api/eventi/responses/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const rec = lib.findResponse(e.request.pathValue("id"));
  const survey = lib.findSurvey(rec.getString("survey"));
  const admin = lib.checkKey(e.request.header.get("X-Admin-Key"), survey.getString("admin_key"));
  if (!admin) {
    if (!lib.checkKey(e.request.header.get("X-Edit-Key"), rec.getString("edit_key"))) throw new ForbiddenError("err.forbidden");
    if (lib.isClosed(survey)) lib.fail("err.closed");
    if (!lib.surveyDTO(survey).settings.allow_edit) lib.fail("err.edit_disabled");
  }
  $app.delete(rec);
  lib.notify(survey.id);
  return e.noContent(204);
});

// Optional cleanup of inactive surveys (EVENTI_RETENTION_DAYS > 0).
cronAdd("eventiCleanup", "30 3 * * *", () => {
  const lib = require(`${__hooks}/lib.js`);
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
