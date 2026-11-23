/// <reference path="../pb_data/types.d.ts" />

// Participant: whoever is answering a survey in the current request, identified by their
// credentials (see GLOSSARY.md). This module is the single place that decides
//   - which response is the participant's own ("mine"),
//   - whether they may respond, edit, see results, and under which name.
//
// Credentials, in order of precedence for "mine":
//   1. account        (Authorization header, active user)
//   2. invitation     (X-Invite-Token: personal invitation link)
//   3. edit key       (X-Response-Id + X-Edit-Key of an earlier anonymous response)
// owns(response) accepts any of the three, so nobody loses access to an older response.

function invitationByToken(surveyId, token) {
  if (!token || typeof token !== "string" || token.length < 20) return null;
  try {
    const lib = require(`${__hooks}/lib.js`);
    const inv = $app.findFirstRecordByFilter("invitations", "token = {:t} && survey = {:s}", { t: token, s: surveyId });
    return lib.checkKey(token, inv.getString("token")) ? inv : null;
  } catch (_) {
    return null;
  }
}

function findResponse(filter, params) {
  try {
    return $app.findFirstRecordByFilter("responses", filter, params);
  } catch (_) {
    return null;
  }
}

// Builds the participant context for a survey record.
//   opts.responseId: response addressed by the route (PATCH/DELETE), used for the edit-key check
function participant(e, survey, opts) {
  const lib = require(`${__hooks}/lib.js`);
  opts = opts || {};
  const user = lib.currentUser(e);
  const invitation = invitationByToken(survey.id, e.request.header.get("X-Invite-Token"));
  const editKey = e.request.header.get("X-Edit-Key");
  const keyResponseId = opts.responseId || e.request.header.get("X-Response-Id");
  const settings = lib.surveyDTO(survey).settings;
  const closed = lib.isClosed(survey);
  const admin = lib.canAdmin(e, survey);

  // Response reachable with the edit key (must belong to this survey)
  let byKey = null;
  if (editKey && keyResponseId) {
    const r = findResponse("id = {:id} && survey = {:s}", { id: keyResponseId, s: survey.id });
    if (r && lib.checkKey(editKey, r.getString("edit_key"))) byKey = r;
  }
  const byAccount = user ? findResponse("survey = {:s} && user = {:u}", { s: survey.id, u: user.id }) : null;
  const linkedId = invitation ? invitation.getString("response") : "";
  const byInvitation = linkedId ? findResponse("id = {:id} && survey = {:s}", { id: linkedId, s: survey.id }) : null;

  const response = byAccount || byInvitation || byKey;
  const mustLogin = settings.require_login && !user && !invitation;

  const ctx = {
    user: user,
    invitation: invitation,
    settings: settings,
    closed: closed,
    admin: admin,
    // the participant's own response (record) or null
    response: response,
    mustLogin: mustLogin,
    canRespond: !closed && !response && !mustLogin,
    canEdit: !!response && !closed && settings.allow_edit,
    canSeeResults: admin || settings.results === "always" || (settings.results === "after_vote" && (!!response || closed)),

    // Any credential that matches this response
    owns: (rec) => {
      if (!rec) return false;
      if (byKey && byKey.id === rec.id) return true;
      if (user && rec.getString("user") === user.id) return true;
      return !!linkedId && linkedId === rec.id;
    },

    // Name fixed by the credentials when the survey requires an account (invitation name as fallback);
    // otherwise only a suggestion for the name field
    name: () => {
      if (user) return lib.displayName(user).slice(0, 60);
      if (invitation) return (invitation.getString("name") || invitation.getString("email").split("@")[0]).slice(0, 60);
      return "";
    },
  };
  ctx.nameIsFixed = settings.require_login && !!ctx.name();
  return ctx;
}

// What the client needs to know about the participant (no secrets)
function participantDTO(ctx) {
  return {
    can_respond: ctx.canRespond,
    can_edit: ctx.canEdit,
    must_login: ctx.mustLogin,
    name: ctx.name(),
    name_fixed: ctx.nameIsFixed,
    invited_as: ctx.invitation ? ctx.invitation.getString("email") : "",
  };
}

module.exports = { participant, participantDTO };
