/// <reference path="../pb_data/types.d.ts" />

// Mail texts (de/en/fr) and sending helpers. Loaded via require() like lib.js.
// Every mail uses the recipient's language (users.lang), falling back to EVENTI_DEFAULT_LANG.

const T = {
  de: {
    otp_subject: "Dein Anmeldecode: {code}",
    otp_body: "<p>Dein Code für die Anmeldung bei {app}:</p>{big:code}<p>Er ist 10 Minuten gültig. Wenn du das nicht warst, kannst du diese Mail ignorieren.</p>",
    verify_subject: "E-Mail-Adresse bestätigen",
    verify_body: "<p>Bitte bestätige deine E-Mail-Adresse für {app}:</p>{button:link:Adresse bestätigen}",
    reset_subject: "Passwort zurücksetzen",
    reset_body: "<p>Über diesen Link kannst du ein neues Passwort für {app} festlegen:</p>{button:link:Neues Passwort festlegen}<p>Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren.</p>",
    invite_subject: "Einladung zu {app}",
    invite_body: "<p>{inviter} hat dich zu {app} eingeladen – damit kannst du Umfragen und Terminfindungen erstellen.</p>{button:link:Jetzt anmelden}<p>Melde dich mit dieser Adresse ({email}) an und lass dir einen Code per Mail schicken.</p>",
    approved_subject: "Dein Konto bei {app} ist freigeschaltet",
    approved_body: "<p>Dein Konto wurde freigeschaltet. Du kannst dich jetzt anmelden:</p>{button:link:Anmelden}",
    pending_subject: "Neue Registrierung wartet auf Freischaltung",
    pending_body: "<p>{name} ({email}) hat sich bei {app} registriert und wartet auf Freischaltung.</p>{button:link:Benutzer verwalten}",
    digest_subject: "Neue Antworten: {title}",
    digest_body: "<p>Bei deiner Umfrage <strong>{title}</strong> sind neue Antworten eingegangen:</p>{names}<p>Insgesamt {count} Teilnehmende.</p>{button:link:Ergebnisse ansehen}",
    final_subject: "Termin steht fest: {title}",
    final_body: "<p>Für <strong>{title}</strong> wurde der Termin festgelegt:</p>{slots}{button:link:Zur Umfrage (mit Kalendereintrag)}",
    footer: "Du erhältst diese Mail von {app}. Benachrichtigungen kannst du in deinem Konto abschalten.",
    allday: "ganztägig",
    survey_invite_subject: "Einladung: {title}",
    survey_invite_body: "<p>{inviter} lädt dich zur Umfrage <strong>{title}</strong> ein.</p>{desc}{closes}{button:link:Jetzt abstimmen}<p style=\"font-size:13px;color:#6b6b78\">Der Link ist persönlich – leite ihn bitte nicht weiter.</p>",
    reminder_subject: "Erinnerung: {title}",
    reminder_body: "<p>Du hast bei <strong>{title}</strong> noch nicht abgestimmt.</p>{closes}{button:link:Jetzt abstimmen}",
    closes: "Die Umfrage schließt am {date}.",
    footer_invite: "Du erhältst diese Mail, weil {inviter} dich zu dieser Umfrage eingeladen hat.",
  },
  en: {
    otp_subject: "Your sign-in code: {code}",
    otp_body: "<p>Your code for signing in to {app}:</p>{big:code}<p>It is valid for 10 minutes. If this wasn't you, you can ignore this email.</p>",
    verify_subject: "Confirm your email address",
    verify_body: "<p>Please confirm your email address for {app}:</p>{button:link:Confirm address}",
    reset_subject: "Reset your password",
    reset_body: "<p>Use this link to set a new password for {app}:</p>{button:link:Set new password}<p>If you didn't request this, you can ignore this email.</p>",
    invite_subject: "Invitation to {app}",
    invite_body: "<p>{inviter} invited you to {app} – create polls and find dates together.</p>{button:link:Sign in now}<p>Sign in with this address ({email}) and request a code by email.</p>",
    approved_subject: "Your {app} account has been approved",
    approved_body: "<p>Your account has been approved. You can sign in now:</p>{button:link:Sign in}",
    pending_subject: "New sign-up awaiting approval",
    pending_body: "<p>{name} ({email}) signed up for {app} and is waiting for approval.</p>{button:link:Manage users}",
    digest_subject: "New responses: {title}",
    digest_body: "<p>Your poll <strong>{title}</strong> received new responses:</p>{names}<p>{count} participants in total.</p>{button:link:View results}",
    final_subject: "Date confirmed: {title}",
    final_body: "<p>The date for <strong>{title}</strong> has been set:</p>{slots}{button:link:Open poll (with calendar entry)}",
    footer: "You receive this email from {app}. You can turn off notifications in your account.",
    allday: "all day",
    survey_invite_subject: "Invitation: {title}",
    survey_invite_body: "<p>{inviter} invites you to the poll <strong>{title}</strong>.</p>{desc}{closes}{button:link:Vote now}<p style=\"font-size:13px;color:#6b6b78\">This link is personal – please don't forward it.</p>",
    reminder_subject: "Reminder: {title}",
    reminder_body: "<p>You haven't voted in <strong>{title}</strong> yet.</p>{closes}{button:link:Vote now}",
    closes: "The poll closes on {date}.",
    footer_invite: "You receive this email because {inviter} invited you to this poll.",
  },
  fr: {
    otp_subject: "Votre code de connexion : {code}",
    otp_body: "<p>Votre code pour vous connecter à {app} :</p>{big:code}<p>Il est valable 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>",
    verify_subject: "Confirmez votre adresse e-mail",
    verify_body: "<p>Merci de confirmer votre adresse e-mail pour {app} :</p>{button:link:Confirmer l’adresse}",
    reset_subject: "Réinitialiser le mot de passe",
    reset_body: "<p>Ce lien vous permet de définir un nouveau mot de passe pour {app} :</p>{button:link:Nouveau mot de passe}<p>Si vous n’avez rien demandé, ignorez ce message.</p>",
    invite_subject: "Invitation à {app}",
    invite_body: "<p>{inviter} vous invite sur {app} – pour créer des sondages et trouver des dates.</p>{button:link:Se connecter}<p>Connectez-vous avec cette adresse ({email}) et demandez un code par e-mail.</p>",
    approved_subject: "Votre compte {app} est activé",
    approved_body: "<p>Votre compte a été activé. Vous pouvez vous connecter dès maintenant :</p>{button:link:Se connecter}",
    pending_subject: "Nouvelle inscription en attente",
    pending_body: "<p>{name} ({email}) s’est inscrit sur {app} et attend une validation.</p>{button:link:Gérer les utilisateurs}",
    digest_subject: "Nouvelles réponses : {title}",
    digest_body: "<p>Votre sondage <strong>{title}</strong> a reçu de nouvelles réponses :</p>{names}<p>{count} participants au total.</p>{button:link:Voir les résultats}",
    final_subject: "Date fixée : {title}",
    final_body: "<p>La date pour <strong>{title}</strong> a été fixée :</p>{slots}{button:link:Ouvrir le sondage (avec entrée de calendrier)}",
    footer: "Vous recevez cet e-mail de {app}. Vous pouvez désactiver les notifications dans votre compte.",
    allday: "toute la journée",
    survey_invite_subject: "Invitation : {title}",
    survey_invite_body: "<p>{inviter} vous invite au sondage <strong>{title}</strong>.</p>{desc}{closes}{button:link:Voter maintenant}<p style=\"font-size:13px;color:#6b6b78\">Ce lien est personnel – merci de ne pas le transférer.</p>",
    reminder_subject: "Rappel : {title}",
    reminder_body: "<p>Vous n’avez pas encore voté pour <strong>{title}</strong>.</p>{closes}{button:link:Voter maintenant}",
    closes: "Le sondage se termine le {date}.",
    footer_invite: "Vous recevez cet e-mail car {inviter} vous a invité à ce sondage.",
  },
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function defaultLang() {
  const l = $os.getenv("EVENTI_DEFAULT_LANG");
  return T[l] ? l : "de";
}

function langOf(user) {
  const l = user ? user.getString("lang") : "";
  return T[l] ? l : defaultLang();
}

function appName() {
  return $app.settings().meta.appName || "eventi";
}

function url(path) {
  return $app.settings().meta.appURL.replace(/\/+$/, "") + "/" + path.replace(/^\//, "");
}

// Renders template <key>_subject / <key>_body. vars are plain text (escaped here);
// vars ending in "_html" are inserted as-is. Markup in templates:
//   {big:var}            large code block
//   {button:var:Label}   call-to-action link to vars[var]
function render(lang, key, vars) {
  const d = T[lang] || T.de;
  const all = Object.assign({ app: appName() }, vars || {});
  const fill = (s, html) => s.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in all)) return m;
    if (k.slice(-5) === "_html") return html ? all[k] : "";
    return html ? esc(all[k]) : String(all[k]);
  });
  let body = d[key + "_body"]
    .replace(/\{big:(\w+)\}/g, (m, k) => '<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:20px 0">' + esc(all[k]) + "</p>")
    .replace(/\{button:(\w+):([^}]+)\}/g, (m, k, label) =>
      '<p style="margin:24px 0"><a href="' + esc(all[k]) + '" style="background:#6d4ae0;color:#fff;padding:11px 18px;border-radius:9px;text-decoration:none;font-weight:600;display:inline-block">' + esc(label) + "</a></p>" +
      '<p data-url style="font-size:12px;color:#6b6b78;word-break:break-all">' + esc(all[k]) + "</p>")
    .replace(/\{(\w+)\}/g, (m, k) => ((k + "_html") in all ? all[k + "_html"] : m));
  body = fill(body, true);
  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#16161b;max-width:520px">' +
    body + (key === "digest" || key === "final" || key === "survey_invite" || key === "reminder" ? '<hr style="border:0;border-top:1px solid #e4e4ea;margin:28px 0 12px"><p style="font-size:12px;color:#6b6b78">' + fill(key === "digest" || key === "final" ? d.footer : d.footer_invite, true) + "</p>" : "") + "</div>";
  const text = html.replace(/<p data-url[^>]*>[^<]*<\/p>/g, "").replace(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g, "$2: $1").replace(/<br\s*\/?>|<\/p>|<\/li>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
  return { subject: fill(d[key + "_subject"], false), html: html, text: text };
}

function list(items) {
  return '<ul style="padding-left:20px">' + items.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>";
}

// Sends one email (template "key" in the recipient's language). Throws on failure, so the
// outbox (outbox.js) can retry; all eventi emails go through the outbox.
function deliver(to, key, vars) {
  const meta = $app.settings().meta;
  const m = render(to.lang || defaultLang(), key, vars);
  $app.newMailClient().send(new MailerMessage({
    from: { address: meta.senderAddress, name: meta.senderName },
    to: [{ address: to.email, name: to.name || "" }],
    subject: m.subject,
    html: m.html,
    text: m.text,
  }));
}

// Recipient of an account (user is kept for the outbox's eligibility rule)
const recipient = (u) => ({ email: u.email(), name: u.getString("name"), lang: langOf(u), user: u });

// Replaces subject/body of a PocketBase system mail (OTP, verification, reset) with our template
function rewrite(e, key, vars) {
  const m = render(langOf(e.record), key, vars);
  e.message.subject = m.subject;
  e.message.html = m.html;
  e.message.text = m.text;
}

module.exports = { T, esc, render, deliver, list, url, langOf, defaultLang, recipient, rewrite };
