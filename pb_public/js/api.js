import { t, has } from "./i18n.js";
import { store } from "./util.js";

// --- Session (PocketBase auth token of the users collection) -----------------

const SESSION_KEY = "eventi:session";
let session = store.get(SESSION_KEY); // { token, user }

export const currentUser = () => session?.user || null;
export const isAdmin = () => currentUser()?.role === "admin";

export function setSession(token, user) {
  session = { token, user };
  store.set(SESSION_KEY, session);
}

export function updateSessionUser(user) {
  if (session) setSession(session.token, user);
}

export function clearSession() {
  session = null;
  store.del(SESSION_KEY);
}

// --- Requests ----------------------------------------------------------------

// Personal invitation token of the current survey page (sent as X-Invite-Token)
let inviteToken = "";
export const setInviteToken = (tok) => (inviteToken = tok || "");

async function request(method, url, { body, headers } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session?.token ? { Authorization: session.token } : {}),
      ...(inviteToken && url.startsWith("/api/eventi/") ? { "X-Invite-Token": inviteToken } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || res.statusText);
    err.status = res.status;
    err.data = data.data || {};
    // Token expired or account blocked: forget the session
    if (res.status === 401 && session?.token) clearSession();
    throw err;
  }
  return data;
}

const req = (method, path, opts) => request(method, `/api/eventi${path}`, opts);
const users = (method, path, body) => request(method, `/api/collections/users${path}`, { body });

export const api = {
  createSurvey: (body) => req("POST", "/surveys", { body }),
  getSurvey: (id, headers) => req("GET", `/surveys/${encodeURIComponent(id)}`, { headers }),
  updateSurvey: (id, key, body) => req("PATCH", `/surveys/${id}`, { body, headers: key ? { "X-Admin-Key": key } : {} }),
  deleteSurvey: (id, key) => req("DELETE", `/surveys/${id}`, { headers: key ? { "X-Admin-Key": key } : {} }),
  vote: (id, body) => req("POST", `/surveys/${id}/responses`, { body }),
  updateVote: (rid, key, body) => req("PATCH", `/responses/${rid}`, { body, headers: key ? { "X-Edit-Key": key } : {} }),
  deleteVote: (rid, headers) => req("DELETE", `/responses/${rid}`, { headers }),

  me: () => req("GET", "/me"),
  updateMe: (body) => req("PATCH", "/me", { body }),
  mySurveys: () => req("GET", "/me/surveys"),
  listUsers: () => req("GET", "/users"),
  inviteUser: (body) => req("POST", "/users", { body }),
  updateUser: (id, body) => req("PATCH", `/users/${id}`, { body }),
  deleteUser: (id) => req("DELETE", `/users/${id}`),

  listInvitations: (id, key) => req("GET", `/surveys/${id}/invitations`, { headers: key ? { "X-Admin-Key": key } : {} }),
  invite: (id, key, emails) => req("POST", `/surveys/${id}/invitations`, { body: { emails }, headers: key ? { "X-Admin-Key": key } : {} }),
  remind: (id, key) => req("POST", `/surveys/${id}/invitations/remind`, { headers: key ? { "X-Admin-Key": key } : {} }),
  deleteInvitation: (iid, key) => req("DELETE", `/invitations/${iid}`, { headers: key ? { "X-Admin-Key": key } : {} }),
};

// PocketBase's own auth endpoints
export const auth = {
  withPassword: (identity, password) => users("POST", "/auth-with-password", { identity, password }),
  requestOtp: (email) => users("POST", "/request-otp", { email }),
  withOtp: (otpId, password) => users("POST", "/auth-with-otp", { otpId, password }),
  refresh: () => users("POST", "/auth-refresh"),
  signup: (body) => users("POST", "/records", body),
  requestReset: (email) => users("POST", "/request-password-reset", { email }),
  confirmReset: (token, password) => users("POST", "/confirm-password-reset", { token, password, passwordConfirm: password }),
  confirmVerification: (token) => users("POST", "/confirm-verification", { token }),
  requestVerification: (email) => users("POST", "/request-verification", { email }),
  changePassword: (id, oldPassword, password) => users("PATCH", `/records/${id}`, { oldPassword, password, passwordConfirm: password }),
};

// After a successful login: store token + eventi profile
export async function startSession(res) {
  setSession(res.token, null);
  const me = await api.me();
  setSession(res.token, me);
  return me;
}

// Called on page load: renews the token (sliding session) and the profile
export async function refreshSession() {
  if (!session?.token) return null;
  try {
    const res = await auth.refresh();
    return await startSession(res);
  } catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 404) clearSession();
    return currentUser();
  }
}

// Error -> translated message. Custom errors are i18n keys; PocketBase
// capitalizes them and appends a dot ("Err.closed.").
export function errMsg(err) {
  const key = String(err?.message || "").replace(/\.$/, "").replace(/^E/, "e");
  if (has(key)) return t(key);
  const fields = err?.data || {};
  if (fields.email?.code === "validation_not_unique") return t("err.email_taken");
  if (fields.email) return t("err.invalid_email");
  if (fields.password || fields.passwordConfirm) return t("err.password_short");
  if (fields.oldPassword) return t("err.old_password");
  if (err?.status === 429) return t("err.rate_limit");
  return t("err.generic");
}

// Live updates via PocketBase realtime (SSE) on the custom topic "eventi:<id>".
export function subscribe(surveyId, onChange) {
  if (!window.EventSource) return () => {};
  const topic = `eventi:${surveyId}`;
  const es = new EventSource("/api/realtime");
  let timer;
  es.addEventListener("PB_CONNECT", (ev) => {
    const { clientId } = JSON.parse(ev.data);
    fetch("/api/realtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, subscriptions: [topic] }),
    }).catch(() => {});
  });
  es.addEventListener(topic, () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 250);
  });
  return () => es.close();
}
