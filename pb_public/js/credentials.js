// Credentials of the participant for one survey, as far as they live in this browser
// (see GLOSSARY.md): the personal invitation link (#i=<token>, remembered per survey) and the
// edit key of the participant's own response. The account is the session in api.js.
// Only this module knows the storage keys and the request headers.
import { store, hashParams } from "./util.js";

export function surveyCredentials(surveyId) {
  const RESPONSE_KEY = `eventi:r:${surveyId}`; // { id, key } of the own response
  const INVITE_KEY = `eventi:i:${surveyId}`;   // invitation token

  // Personal invitation link: remember the token and drop it from the address bar
  let invite = hashParams.get("i") || store.get(INVITE_KEY) || "";
  if (hashParams.get("i")) {
    store.set(INVITE_KEY, invite);
    history.replaceState(null, "", location.pathname + location.search);
  }
  let own = store.get(RESPONSE_KEY);

  return {
    // Headers that identify the participant towards the survey API
    headers() {
      const h = {};
      if (invite) h["X-Invite-Token"] = invite;
      if (own?.id && own?.key) {
        h["X-Response-Id"] = own.id;
        h["X-Edit-Key"] = own.key;
      }
      return h;
    },

    // After responding without an account: keep the edit key for later changes
    remember(responseId, editKey) {
      own = { id: responseId, key: editKey };
      store.set(RESPONSE_KEY, own);
    },

    forgetResponse() {
      own = null;
      store.del(RESPONSE_KEY);
    },

    // Forget what the server no longer recognises (invitation removed, response deleted)
    sync(data) {
      if (invite && !data.participant?.invited_as) {
        invite = "";
        store.del(INVITE_KEY);
      }
      if (own && !data.mine) this.forgetResponse();
    },
  };
}
