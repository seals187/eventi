/// <reference path="../pb_data/types.d.ts" />

// Invitations of a survey (owner or admin link). See invite.js.

routerAdd("GET", "/api/eventi/surveys/{id}/invitations", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const inv = require(`${__hooks}/invite.js`);
  const survey = lib.adminSurvey(e);
  return e.json(200, inv.list(survey));
});

// Body: { emails: "anna@x.ch, Bob <bob@y.ch>\n..." }
routerAdd("POST", "/api/eventi/surveys/{id}/invitations", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const inv = require(`${__hooks}/invite.js`);
  const survey = lib.adminSurvey(e);
  if (lib.isClosed(survey)) lib.fail("err.closed");
  const res = inv.add(survey, lib.readBody(e).emails);
  return e.json(200, { added: res.added, skipped: res.skipped, invitations: inv.list(survey) });
});

// Remind everyone who has not voted yet (at most every 12 h per person)
routerAdd("POST", "/api/eventi/surveys/{id}/invitations/remind", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const inv = require(`${__hooks}/invite.js`);
  const survey = lib.adminSurvey(e);
  if (lib.isClosed(survey)) lib.fail("err.closed");
  const n = inv.queueReminders(survey, true);
  return e.json(200, { queued: n, invitations: inv.list(survey) });
});

routerAdd("DELETE", "/api/eventi/invitations/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  let rec;
  try {
    rec = $app.findRecordById("invitations", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("err.not_found");
  }
  lib.adminSurvey(e, rec.getString("survey"));
  $app.delete(rec);
  return e.noContent(204);
});
