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

  settings.rateLimits.enabled = env("EVENTI_RATE_LIMIT", "true") !== "false";
  settings.rateLimits.rules = [
    { label: "POST /api/eventi/surveys", maxRequests: int("EVENTI_RATE_LIMIT_CREATE", 10), duration: 60 },
    { label: "/api/eventi/", maxRequests: int("EVENTI_RATE_LIMIT_API", 120), duration: 60 },
    { label: "/api/", maxRequests: int("EVENTI_RATE_LIMIT_API", 120) * 3, duration: 60 },
  ];

  const proxyHeader = env("EVENTI_TRUSTED_PROXY_HEADER", "");
  settings.trustedProxy.headers = proxyHeader ? [proxyHeader] : [];
  settings.trustedProxy.useLeftmostIP = proxyHeader !== "";

  e.app.save(settings);
});
