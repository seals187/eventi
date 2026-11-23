/// <reference path="../pb_data/types.d.ts" />

// Static files: make browsers revalidate on every load (cheap 304 if unchanged),
// so JS, CSS and translations never get out of sync after an update.
routerUse((e) => {
  if (!e.request.url.path.startsWith("/api/") && !e.request.url.path.startsWith("/_/")) {
    e.response.header().set("Cache-Control", "no-cache");
  }
  return e.next();
});
