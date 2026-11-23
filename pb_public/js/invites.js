// "Participants" card on the admin page: who has voted (green chips), invited people who
// have not voted yet (dashed chips), invite form and reminders.
// State lives in the module, so typed addresses survive re-renders (realtime updates).
import { h, toast, icon, setChildren } from "./util.js";
import { t, appConfig, fmtDate } from "./i18n.js";
import { api, errMsg } from "./api.js";

let ctx = null;          // { id, key, survey, responses, onChange }
let list = [];           // invitations
let draft = "";
let formOpen = false;
let box = null;
let busy = false;

export async function loadInvites(id, key) {
  try {
    list = await api.listInvitations(id, key);
  } catch {
    list = [];
  }
}

// Invited people who have not voted yet
export const pendingInvites = () => list.filter((i) => !i.voted);

export function participantsCard(c) {
  ctx = c;
  box = h("section", { class: "card participants", id: "participants" });
  paint();
  return box;
}

export function openInviteForm() {
  formOpen = true;
  paint();
  box?.scrollIntoView({ behavior: "smooth", block: "center" });
  requestAnimationFrame(() => box?.querySelector("textarea")?.focus());
}

async function run(fn) {
  if (busy) return;
  busy = true;
  paint();
  try {
    await fn();
  } catch (e) {
    toast(errMsg(e), "err");
  } finally {
    busy = false;
    paint();
    ctx.onChange?.();
  }
}

function paint() {
  if (!box) return;
  const s = ctx.survey;
  const mail = appConfig().mail;
  const pending = pendingInvites();
  const canInvite = mail && !s.is_closed;

  const add = () => run(async () => {
    if (!draft.trim()) return;
    const r = await api.invite(ctx.id, ctx.key, draft);
    list = r.invitations;
    draft = "";
    toast(r.skipped ? t("invites.added_skipped", { n: r.added, m: r.skipped }) : t("invites.added", { n: r.added }));
  });

  const remind = () => run(async () => {
    if (!confirm(t("invites.remind_confirm", { n: pending.length }))) return;
    const r = await api.remind(ctx.id, ctx.key);
    list = r.invitations;
    toast(r.queued ? t("invites.reminded", { n: r.queued }) : t("invites.reminded_none"));
  });

  const remove = (inv) => run(async () => {
    if (!confirm(t("invites.remove_confirm", { email: inv.email }))) return;
    await api.deleteInvitation(inv.id, ctx.key);
    list = list.filter((x) => x.id !== inv.id);
  });

  const pendingTitle = (inv) => [
    inv.email,
    !inv.invite_sent ? t("invites.queued") : inv.remind_queued ? t("invites.remind_queued")
      : inv.reminded_at ? t("invites.reminded_at", { date: fmtDate(new Date(inv.reminded_at), { dateStyle: "short" }) }) : t("invites.open"),
  ].join(" · ");

  const ta = h("textarea", {
    rows: 2, value: draft, placeholder: t("invites.placeholder"), "aria-label": t("invites.add"),
    oninput: (e) => (draft = e.target.value),
  });

  setChildren(box,
    h("div", { class: "card-head" },
      h("h2", {}, t("part.title")),
      canInvite && h("button", { type: "button", class: "btn-link", onclick: () => (formOpen ? ((formOpen = false), paint()) : openInviteForm()) },
        icon("mail"), " ", t("invites.add"))),
    !ctx.responses.length && !list.length && h("p", { class: "muted small" }, t("part.none")),
    h("div", { class: "pchips" },
      ctx.responses.map((r) => h("span", { class: "pchip pchip-voted", title: r.name }, ICON_CHECK(), r.name)),
      pending.map((inv) => h("span", { class: "pchip pchip-pending", title: pendingTitle(inv) },
        "… ", inv.name || inv.email,
        h("button", { type: "button", class: "pchip-x", disabled: busy, "aria-label": `${t("invites.remove")}: ${inv.email}`, onclick: () => remove(inv) }, icon("x"))))),
    !mail && formOpen && h("p", { class: "notice" }, t("invites.no_mail")),
    canInvite && formOpen && h("div", { class: "invite-form" },
      h("div", { class: "invite-add" },
        ta,
        h("button", { type: "button", class: "btn btn-primary", disabled: busy, onclick: add }, icon("mail"), t("invites.add"))),
      h("small", { class: "hint" }, t("invites.hint"))),
    canInvite && list.length > 0 && h("div", { class: "card-foot" },
      h("span", { class: "muted small" }, s.closes_at ? t("invites.auto_on") : t("invites.auto_off")),
      h("button", { type: "button", class: "btn", disabled: busy || !pending.length, onclick: remind },
        icon("mail"), pending.length ? t("invites.remind", { n: pending.length }) : t("invites.all_voted"))));
}

const ICON_CHECK = () => h("span", { class: "pchip-ic", "aria-hidden": "true" }, "✓");
