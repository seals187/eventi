import { t, has } from "./i18n.js";

const BASE = "/api/eventi";

async function req(method, path, { body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  createSurvey: (body) => req("POST", "/surveys", { body }),
  getSurvey: (id, headers) => req("GET", `/surveys/${encodeURIComponent(id)}`, { headers }),
  updateSurvey: (id, key, body) => req("PATCH", `/surveys/${id}`, { body, headers: { "X-Admin-Key": key } }),
  deleteSurvey: (id, key) => req("DELETE", `/surveys/${id}`, { headers: { "X-Admin-Key": key } }),
  vote: (id, body) => req("POST", `/surveys/${id}/responses`, { body }),
  updateVote: (rid, key, body) => req("PATCH", `/responses/${rid}`, { body, headers: { "X-Edit-Key": key } }),
  deleteVote: (rid, headers) => req("DELETE", `/responses/${rid}`, { headers }),
};

// PocketBase capitalizes messages and appends a dot ("Err.closed.").
export function errMsg(err) {
  const key = String(err?.message || "").replace(/\.$/, "").replace(/^E/, "e");
  if (has(key)) return t(key);
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
