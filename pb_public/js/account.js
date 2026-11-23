import { h, field, toast, adminUrl } from "./util.js";
import { t, initI18n, onLangChange, appConfig, setLang, fmtDate } from "./i18n.js";
import { api, auth, errMsg, currentUser, updateSessionUser, clearSession } from "./api.js";
import { initHeader, loginUrl, renderMineMenu } from "./header.js";

const app = document.getElementById("app");
let surveys = [];

function profileCard(user) {
  const nameIn = h("input", { type: "text", maxlength: 60, value: user.name, autocomplete: "name", placeholder: user.display_name });
  const langSel = h("select", {}, [["", t("account.lang_auto")], ["de", "Deutsch"], ["en", "English"], ["fr", "Français"]]
    .map(([v, l]) => h("option", { value: v, selected: user.lang === v }, l)));
  const optIn = h("input", { type: "checkbox", role: "switch", class: "switch", checked: !user.mail_opt_out });
  const save = h("button", { type: "submit", class: "btn btn-primary" }, t("account.save"));
  return h("form", {
    class: "card",
    onsubmit: async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        const me = await api.updateMe({ name: nameIn.value.trim(), lang: langSel.value, mail_opt_out: !optIn.checked });
        updateSessionUser(me);
        if (me.lang) await setLang(me.lang);
        else render();
        toast(t("account.saved"));
      } catch (ex) {
        toast(errMsg(ex), "err");
      } finally {
        save.disabled = false;
      }
    },
  },
  h("h2", {}, t("account.profile")),
  h("p", { class: "muted small" }, user.email, user.role === "admin" && ` · ${t("users.role_admin")}`),
  field(t("auth.name"), nameIn, t("account.name_hint")),
  field(t("account.lang"), langSel),
  appConfig().mail && h("label", { class: "set-row plain" },
    h("span", {}, t("account.notify"), h("small", { class: "hint" }, t("account.notify_hint"))),
    optIn),
  h("div", { class: "btn-row" }, save));
}

function passwordCard(user) {
  const oldIn = h("input", { type: "password", autocomplete: "current-password" });
  const newIn = h("input", { type: "password", autocomplete: "new-password", minlength: 8 });
  const err = h("p", { class: "error", role: "alert" });
  return h("form", {
    class: "card",
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = "";
      if (newIn.value.length < 8) return (err.textContent = t("err.password_short"));
      try {
        await auth.changePassword(user.id, oldIn.value, newIn.value);
        // Changing the password invalidates all sessions; log in again
        clearSession();
        location.href = `login.html?email=${encodeURIComponent(user.email)}`;
      } catch (ex) {
        err.textContent = errMsg(ex);
      }
    },
  },
  h("h2", {}, t("account.password")),
  appConfig().mail && h("p", { class: "muted small" }, t("account.password_lead")),
  field(t("account.old_password"), oldIn, appConfig().mail && t("account.old_password_hint")),
  field(t("auth.new_password"), newIn, t("auth.password_hint")),
  err,
  h("div", { class: "btn-row" }, h("button", { type: "submit", class: "btn" }, t("account.password_save"))));
}

function surveysCard() {
  return h("section", { class: "card" },
    h("h2", {}, t("mine.button")),
    surveys.length
      ? h("ul", { class: "plist" }, surveys.map((s) =>
        h("li", {},
          h("a", { class: "plist-name", href: adminUrl(s.id, s.key) }, s.title),
          h("span", { class: "muted small" },
            `${t("vote.participants", { n: s.count })} · ${s.is_closed ? t("status.closed") : fmtDate(new Date(s.created), { dateStyle: "medium" })}`))))
      : h("p", { class: "muted" }, t("account.no_surveys")),
    h("div", { class: "btn-row" }, h("a", { class: "btn btn-primary", href: "./" }, t("account.new_survey"))));
}

function render() {
  const user = currentUser();
  document.title = `${t("account.title")} · eventi`;
  app.replaceChildren(
    h("p", { class: "eyebrow accent" }, t("account.title")),
    h("h1", { class: "page-title" }, user.display_name),
    surveysCard(),
    profileCard(user),
    passwordCard(user));
}

async function main() {
  await initI18n();
  await initHeader();
  if (!currentUser()) return location.replace(loginUrl());
  try { surveys = await api.mySurveys(); } catch { surveys = []; }
  render();
  onLangChange(() => {
    render();
    renderMineMenu();
  });
}

main();
