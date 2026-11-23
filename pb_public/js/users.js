import { h, field, toast, menu, icon, setChildren } from "./util.js";
import { t, initI18n, onLangChange, appConfig, fmtDate } from "./i18n.js";
import { api, errMsg, currentUser, isAdmin } from "./api.js";
import { initHeader, loginUrl } from "./header.js";

const app = document.getElementById("app");
let users = [];
let filter = "";

async function load() {
  users = await api.listUsers();
}

async function act(fn, msg) {
  try {
    await fn();
    await load();
    render();
    if (msg) toast(msg);
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

function inviteCard() {
  const mail = appConfig().mail;
  const emailIn = h("input", { type: "email", required: true, autocomplete: "off" });
  const nameIn = h("input", { type: "text", maxlength: 60, autocomplete: "off" });
  const roleSel = h("select", {}, h("option", { value: "user" }, t("users.role_user")), h("option", { value: "admin" }, t("users.role_admin")));
  const pwIn = !mail && h("input", { type: "text", minlength: 8, autocomplete: "off" });
  const err = h("p", { class: "error", role: "alert" });
  const btn = h("button", { type: "submit", class: "btn btn-primary" }, icon("plus"), t(mail ? "users.invite_send" : "users.invite_create"));
  return h("form", {
    class: "card",
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = "";
      btn.disabled = true;
      try {
        const u = await api.inviteUser({ email: emailIn.value.trim(), name: nameIn.value.trim(), role: roleSel.value, password: pwIn ? pwIn.value : "" });
        await load();
        render();
        toast(t(u.mailed ? "users.invited_mail" : "users.invited", { email: u.email }));
      } catch (ex) {
        err.textContent = errMsg(ex);
      } finally {
        btn.disabled = false;
      }
    },
  },
  h("h2", {}, t("users.invite")),
  h("p", { class: "muted small" }, t(mail ? "users.invite_lead_mail" : "users.invite_lead")),
  h("div", { class: "form-grid" },
    field(t("auth.email"), emailIn),
    field(t("auth.name"), nameIn),
    field(t("users.role"), roleSel),
    pwIn && field(t("auth.password"), pwIn, t("auth.password_hint"))),
  err,
  h("div", { class: "btn-row" }, btn));
}

function userRow(u) {
  const self = u.id === currentUser().id;
  const items = [];
  if (u.status === "pending") {
    items.push({ icon: "check", label: t("users.approve"), onClick: () => act(() => api.updateUser(u.id, { status: "active" }), t("users.approved")) });
  } else if (!self) {
    items.push(u.status === "blocked"
      ? { icon: "check", label: t("users.unblock"), onClick: () => act(() => api.updateUser(u.id, { status: "active" })) }
      : { icon: "lock", label: t("users.block"), onClick: () => act(() => api.updateUser(u.id, { status: "blocked" })) });
  }
  if (!self && u.status !== "pending") {
    items.push(u.role === "admin"
      ? { icon: "user", label: t("users.make_user"), onClick: () => act(() => api.updateUser(u.id, { role: "user" })) }
      : { icon: "shield", label: t("users.make_admin"), onClick: () => act(() => api.updateUser(u.id, { role: "admin" })) });
  }
  if (!appConfig().mail) {
    items.push({
      icon: "lock", label: t("users.set_password"), onClick: () => {
        const pw = prompt(t("users.set_password_prompt", { email: u.email }));
        if (pw != null) act(() => api.updateUser(u.id, { password: pw }), t("account.saved"));
      },
    });
  }
  if (!self) {
    items.push({
      icon: "trash", label: t(u.status === "pending" ? "users.reject" : "users.delete"), danger: true, onClick: () => {
        const msg = u.surveys ? t("users.delete_confirm_surveys", { email: u.email, n: u.surveys }) : t("users.delete_confirm", { email: u.email });
        if (confirm(msg)) act(() => api.deleteUser(u.id), t("users.deleted"));
      },
    });
  }

  return h("li", { class: `user-row status-${u.status}` },
    h("span", { class: "avatar-sm", "aria-hidden": "true" }, (u.display_name || "?").charAt(0).toUpperCase()),
    h("div", { class: "user-main" },
      h("strong", {}, u.display_name, self && h("span", { class: "muted" }, ` (${t("users.you")})`)),
      h("small", {}, u.email, ` · ${t("users.surveys_n", { n: u.surveys })} · ${fmtDate(new Date(u.created), { dateStyle: "medium" })}`)),
    h("div", { class: "user-tags" },
      u.role === "admin" && h("span", { class: "pill pill-admin" }, t("users.role_admin")),
      u.status !== "active" && h("span", { class: `pill pill-${u.status}` }, t(`users.status_${u.status}`)),
      u.status === "active" && !u.verified && h("span", { class: "pill" }, t("users.unverified"))),
    items.length ? menu(icon("more"), t("users.actions"), items) : h("span", { class: "menu-spacer" }));
}

function render() {
  document.title = `${t("users.title")} · eventi`;
  const q = filter.toLowerCase();
  const shown = users.filter((u) => !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q));
  const pending = shown.filter((u) => u.status === "pending");
  const rest = shown.filter((u) => u.status !== "pending");
  const searchIn = h("input", {
    type: "search", class: "search", placeholder: t("users.search"), value: filter, "aria-label": t("users.search"),
    oninput: (e) => {
      filter = e.target.value;
      render();
      const el = app.querySelector(".search");
      el.focus();
      el.setSelectionRange(filter.length, filter.length);
    },
  });

  setChildren(app,
    h("p", { class: "eyebrow accent" }, t("users.eyebrow")),
    h("h1", { class: "page-title" }, t("users.title")),
    inviteCard(),
    pending.length && h("section", { class: "card pending-card" },
      h("h2", {}, t("users.pending", { n: pending.length })),
      h("ul", { class: "user-list" }, pending.map(userRow))),
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", {}, t("users.all", { n: users.length })), users.length > 8 && searchIn),
      rest.length ? h("ul", { class: "user-list" }, rest.map(userRow)) : h("p", { class: "muted" }, t("users.none"))));
}

async function main() {
  await initI18n();
  await initHeader();
  if (!currentUser()) return location.replace(loginUrl());
  if (!isAdmin()) {
    app.replaceChildren(h("section", { class: "card error-card" }, h("p", {}, t("err.forbidden")), h("a", { class: "btn", href: "./" }, t("action.home"))));
    return;
  }
  try {
    await load();
  } catch (e) {
    toast(errMsg(e), "err");
    return;
  }
  render();
  onLangChange(render);
}

main();
