import { h, toast, iconBtn, icon } from "./util.js";
import { t, appConfig, fmtDate } from "./i18n.js";
import { api, errMsg } from "./api.js";

// "Invited people" card on the admin page: invite by email, see who has voted, remind.
// State lives in the module, so typed addresses survive re-renders (realtime updates).

let ctx = null;          // { id, key, survey }
let list = [];
let draft = "";
let box = null;
let busy = false;

export async function loadInvites(id, key) {
  try {
    list = await api.listInvitations(id, key);
  } catch {
    list = [];
  }
}

export function invitesCard(c) {
  ctx = c;
  box = h("section", { class: "card invites" });
  paint();
  return box;
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
  }
}

function paint() {
  if (!box) return;
  const s = ctx.survey;
  const mail = appConfig().mail;
  const voted = list.filter((i) => i.voted).length;
  const open = list.length - voted;

  const ta = h("textarea", {
    rows: 2, value: draft, disabled: !mail || s.is_closed,
    placeholder: t("invites.placeholder"), "aria-label": t("invites.add"),
    oninput: (e) => (draft = e.target.value),
  });

  const add = () => run(async () => {
    if (!draft.trim()) return;
    const r = await api.invite(ctx.id, ctx.key, draft);
    list = r.invitations;
    draft = "";
    toast(r.skipped ? t("invites.added_skipped", { n: r.added, m: r.skipped }) : t("invites.added", { n: r.added }));
  });

  const remind = () => run(async () => {
    if (!confirm(t("invites.remind_confirm", { n: open }))) return;
    const r = await api.remind(ctx.id, ctx.key);
    list = r.invitations;
    toast(r.queued ? t("invites.reminded", { n: r.queued }) : t("invites.reminded_none"));
  });

  const remove = (inv) => run(async () => {
    if (!confirm(t("invites.remove_confirm", { email: inv.email }))) return;
    await api.deleteInvitation(inv.id, ctx.key);
    list = list.filter((x) => x.id !== inv.id);
  });

  const status = (inv) => {
    if (inv.voted) return h("span", { class: "pill pill-open" }, t("invites.voted"));
    if (inv.remind_queued) return h("span", { class: "pill" }, t("invites.remind_queued"));
    if (inv.reminded_at) return h("span", { class: "pill pill-pending" }, t("invites.reminded_at", { date: fmtDate(new Date(inv.reminded_at), { dateStyle: "short" }) }));
    if (!inv.invite_sent) return h("span", { class: "pill" }, t("invites.queued"));
    return h("span", { class: "pill pill-pending" }, t("invites.open"));
  };

  box.replaceChildren(
    h("div", { class: "card-head" },
      h("h2", {}, t("invites.title")),
      list.length > 0 && h("span", { class: "muted small" }, t("invites.progress", { n: voted, total: list.length }))),
    !mail && h("p", { class: "notice" }, t("invites.no_mail")),
    list.length > 0 && h("div", { class: "stack invite-progress", "aria-hidden": "true" },
      h("span", { class: "stack-yes", style: `width:${(voted / list.length) * 100}%` })),
    list.length > 0 && h("ul", { class: "plist invite-list" }, list.map((inv) =>
      h("li", {},
        h("span", { class: "plist-name" }, inv.name || inv.email, inv.name && h("small", { class: "muted" }, ` ${inv.email}`)),
        status(inv),
        iconBtn(icon("x"), t("invites.remove"), busy, () => remove(inv))))),
    mail && !s.is_closed && h("div", { class: "invite-add" },
      ta,
      h("button", { type: "button", class: "btn btn-primary", disabled: busy, onclick: add }, icon("mail"), t("invites.add"))),
    mail && !s.is_closed && h("small", { class: "hint" }, t("invites.hint")),
    mail && open > 0 && !s.is_closed && h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", disabled: busy, onclick: remind }, t("invites.remind", { n: open }))),
    mail && list.length > 0 && !s.is_closed && h("p", { class: "muted small auto-remind" },
      s.closes_at ? t("invites.auto_on") : t("invites.auto_off")));
}
