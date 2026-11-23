/// <reference path="../pb_data/types.d.ts" />

// Applies settings from environment variables (.env) on every start,
// so the .env file stays the single source of truth.
onBootstrap((e) => {
  e.next();

  const env = (name, fallback) => {
    const v = $os.getenv(name);
    return v === "" ? fallback : v;
  };
  const int = (name, fallback) => {
    const n = parseInt(env(name, ""), 10);
    return n > 0 ? n : fallback;
  };

  const settings = e.app.settings();
  settings.meta.appName = env("EVENTI_APP_NAME", "eventi");
  settings.meta.appURL = env("EVENTI_APP_URL", "http://localhost:" + env("EVENTI_PORT", "8090")).replace(/\/+$/, "");

  settings.rateLimits.enabled = env("EVENTI_RATE_LIMIT", "true") !== "false";
  settings.rateLimits.rules = [
    { label: "POST /api/eventi/surveys", maxRequests: int("EVENTI_RATE_LIMIT_CREATE", 10), duration: 60 },
    // Login, sign-up, codes, password reset: brute-force / mail-bombing protection
    { label: "/api/collections/users/", maxRequests: int("EVENTI_RATE_LIMIT_AUTH", 20), duration: 60 },
    { label: "/api/eventi/", maxRequests: int("EVENTI_RATE_LIMIT_API", 120), duration: 60 },
    { label: "/api/", maxRequests: int("EVENTI_RATE_LIMIT_API", 120) * 3, duration: 60 },
  ];

  const proxyHeader = env("EVENTI_TRUSTED_PROXY_HEADER", "");
  settings.trustedProxy.headers = proxyHeader ? [proxyHeader] : [];
  settings.trustedProxy.useLeftmostIP = proxyHeader !== "";

  // Mail (any SMTP server: internal relay, Gmail, Mailgun, ...)
  const smtpHost = env("EVENTI_SMTP_HOST", "");
  const smtpPort = int("EVENTI_SMTP_PORT", 587);
  settings.smtp.enabled = smtpHost !== "";
  settings.smtp.host = smtpHost;
  settings.smtp.port = smtpPort;
  settings.smtp.username = env("EVENTI_SMTP_USER", "");
  settings.smtp.password = env("EVENTI_SMTP_PASSWORD", "");
  settings.smtp.authMethod = env("EVENTI_SMTP_AUTH", "PLAIN").toUpperCase() === "LOGIN" ? "LOGIN" : "PLAIN";
  // Port 465 = implicit TLS; otherwise STARTTLS (587, 25)
  settings.smtp.tls = env("EVENTI_SMTP_TLS", smtpPort === 465 ? "true" : "false") === "true";
  settings.smtp.localName = env("EVENTI_SMTP_LOCALNAME", "");
  settings.meta.senderAddress = env("EVENTI_MAIL_FROM", settings.smtp.username || "noreply@example.com");
  settings.meta.senderName = env("EVENTI_MAIL_FROM_NAME", settings.meta.appName);

  e.app.save(settings);
});

// Account settings + admin account. onBootstrap fires before the migrations, so on the
// very first start the users fields do not exist yet; the users migration then calls
// setup() itself.
onBootstrap((e) => {
  e.next();
  if (e.app.findCollectionByNameOrId("users").fields.getByName("status")) {
    require(`${__hooks}/accounts.js`).setup(e.app);
  }
});
