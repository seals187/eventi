import { h, params, hashParams, field, icon } from "./util.js";
import { t, initI18n, onLangChange, appConfig, currentLang } from "./i18n.js";
import { auth, errMsg, startSession, currentUser, clearSession } from "./api.js";
import { initHeader } from "./header.js";

const app = document.getElementById("app");

// Only same-origin targets, so the login page cannot be abused as open redirect
function nextUrl() {
  try {
    const u = new URL(params.get("next") || "./", location.href);
    return u.origin === location.origin ? u.href : "./";
  } catch {
    return "./";
  }
}

let view = "login";     // login | code | signup | forgot | reset | info
let email = params.get("email") || "";
let otpId = "";
let usePassword = false;
let info = null;        // { text, kind } shown above the form
const resetToken = hashParams.get("reset");

const input = (attrs) => h("input", { class: "input", ...attrs });

function card(title, lead, ...content) {
  return h("section", { class: "card auth-card" },
    h("h1", {}, title),
    lead && h("p", { class: "muted" }, lead),
    info && h("p", { class: `auth-info ${info.kind || ""}`, role: "status" }, info.text),
    ...content);
}

// Form with error line and busy state; handler returns nothing or throws
function form(fields, submitLabel, handler, extra) {
  const err = h("p", { class: "error", role: "alert" });
  const btn = h("button", { type: "submit", class: "btn btn-primary btn-lg btn-block" }, submitLabel);
  const f = h("form", {
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = "";
      btn.disabled = true;
      try {
        await handler(f);
      } catch (ex) {
        err.textContent = ex.msg || errMsg(ex);
      } finally {
        btn.disabled = false;
      }
    },
  }, fields, err, btn, extra);
  return f;
}

const go = (v, i = null) => {
  view = v;
  info = i;
  render();
};

const linkBtn = (label, onclick) => h("button", { type: "button", class: "btn-link small", onclick }, label);

async function finish(res) {
  await startSession(res);
  location.replace(nextUrl());
}

function loginView() {
  const cfg = appConfig();
  const mail = cfg.mail;
  const pw = usePassword || !mail;
  const emailIn = input({ type: "email", name: "email", value: email, autocomplete: "username", required: true, oninput: (e) => (email = e.target.value.trim()) });
  const pwIn = pw && input({ type: "password", name: "password", autocomplete: "current-password", required: true });

  return card(t("auth.login_title"), t(mail ? "auth.login_lead_mail" : "auth.login_lead"),
    form([
      field(t("auth.email"), emailIn),
      pwIn && field(t("auth.password"), pwIn),
    ], pw ? t("auth.login") : t("auth.send_code"), async () => {
      if (!email) throw { msg: t("err.invalid_email") };
      if (pw) {
        try {
          await finish(await auth.withPassword(email, pwIn.value));
        } catch (e) {
          if (e.status === 400) throw { msg: t("err.login_failed") };
          throw e;
        }
      } else {
        otpId = (await auth.requestOtp(email)).otpId;
        go("code");
      }
    }, h("div", { class: "auth-links" },
      mail && linkBtn(pw ? t("auth.use_code") : t("auth.use_password"), () => {
        usePassword = !pw;
        go("login");
      }),
      pw && mail && linkBtn(t("auth.forgot"), () => go("forgot")),
      cfg.signup?.self && linkBtn(t("auth.to_signup"), () => go("signup")))));
}

function codeView() {
  const codeIn = input({
    type: "text", name: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 12, required: true, class: "input code-input",
  });
  requestAnimationFrame(() => codeIn.focus());
  return card(t("auth.code_title"), t("auth.code_lead", { email }),
    form([field(t("auth.code"), codeIn)], t("auth.login"), async () => {
      try {
        await finish(await auth.withOtp(otpId, codeIn.value.replace(/\s+/g, "")));
      } catch (e) {
        if (e.status === 400) throw { msg: t("err.code_invalid") };
        throw e;
      }
    }, h("div", { class: "auth-links" },
      linkBtn(t("auth.resend"), async () => {
        try {
          otpId = (await auth.requestOtp(email)).otpId;
          go("code", { text: t("auth.code_resent") });
        } catch (e) {
          go("code", { text: errMsg(e), kind: "err" });
        }
      }),
      linkBtn(t("auth.other_email"), () => go("login")))));
}

function signupView() {
  const cfg = appConfig();
  const nameIn = input({ type: "text", name: "name", maxlength: 60, autocomplete: "name" });
  const emailIn = input({ type: "email", name: "email", value: email, autocomplete: "email", required: true, oninput: (e) => (email = e.target.value.trim()) });
  const pwIn = input({ type: "password", name: "new-password", autocomplete: "new-password", minlength: 8, required: true });
  const hints = [];
  if (cfg.signup?.domains?.length) hints.push(t("auth.signup_domains", { domains: cfg.signup.domains.map((d) => `@${d}`).join(", ") }));
  if (cfg.signup?.approval) hints.push(t(cfg.signup.domains?.length ? "auth.signup_approval_other" : "auth.signup_approval"));

  return card(t("auth.signup_title"), hints.join(" "),
    form([
      field(t("auth.name"), nameIn),
      field(t("auth.email"), emailIn),
      field(t("auth.password"), pwIn, t("auth.password_hint")),
    ], t("auth.signup"), async () => {
      if (pwIn.value.length < 8) throw { msg: t("err.password_short") };
      const rec = await auth.signup({
        email, name: nameIn.value.trim(), password: pwIn.value, passwordConfirm: pwIn.value, lang: currentLang(),
      });
      if (rec.status === "pending") return go("info", { text: t("auth.signup_pending") });
      if (!cfg.mail) return finish(await auth.withPassword(email, pwIn.value));
      go("info", { text: t("auth.signup_verify") });
    }, h("div", { class: "auth-links" }, linkBtn(t("auth.to_login"), () => go("login")))));
}

function forgotView() {
  const emailIn = input({ type: "email", name: "email", value: email, autocomplete: "username", required: true, oninput: (e) => (email = e.target.value.trim()) });
  return card(t("auth.forgot_title"), t("auth.forgot_lead"),
    form([field(t("auth.email"), emailIn)], t("auth.forgot_send"), async () => {
      if (!email) throw { msg: t("err.invalid_email") };
      await auth.requestReset(email);
      usePassword = true;
      go("login", { text: t("auth.forgot_sent") });
    }, h("div", { class: "auth-links" }, linkBtn(t("auth.to_login"), () => go("login")))));
}

function resetView() {
  const pwIn = input({ type: "password", name: "new-password", autocomplete: "new-password", minlength: 8, required: true });
  return card(t("auth.reset_title"), null,
    form([field(t("auth.new_password"), pwIn, t("auth.password_hint"))], t("auth.reset_save"), async () => {
      if (pwIn.value.length < 8) throw { msg: t("err.password_short") };
      try {
        await auth.confirmReset(resetToken, pwIn.value);
      } catch (e) {
        if (e.status === 400 && e.data?.token) throw { msg: t("err.link_invalid") };
        throw e;
      }
      history.replaceState(null, "", location.pathname + location.search);
      clearSession();
      usePassword = true;
      go("login", { text: t("auth.reset_done") });
    }));
}

function infoView() {
  return card(t("auth.signup_title"), null,
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", onclick: () => go("login", null) }, t("auth.to_login"))));
}

function render() {
  const views = { login: loginView, code: codeView, signup: signupView, forgot: forgotView, reset: resetView, info: infoView };
  document.title = `${t("auth.login_title")} · eventi`;
  app.replaceChildren(h("div", { class: "auth-wrap" }, h("div", { class: "auth-icon" }, icon(view === "code" ? "mail" : "lock")), views[view]()));
  app.querySelector("input:not([value]), input[value='']")?.focus();
}

async function main() {
  await initI18n();
  await initHeader();

  const verifyToken = hashParams.get("verify");
  if (verifyToken) {
    history.replaceState(null, "", location.pathname + location.search);
    try {
      await auth.confirmVerification(verifyToken);
      usePassword = true;
      info = { text: t("auth.verified") };
    } catch {
      info = { text: t("err.link_invalid"), kind: "err" };
    }
  } else if (resetToken) {
    view = "reset";
  } else if (currentUser()) {
    location.replace(nextUrl());
    return;
  }
  render();
  onLangChange(render);
}

main();
