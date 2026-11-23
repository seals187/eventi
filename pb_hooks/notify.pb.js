/// <reference path="../pb_data/types.d.ts" />

// Once a minute: queue automatic reminders that became due, then deliver due outbox jobs.
cronAdd("eventiNotify", "* * * * *", () => {
  try {
    require(`${__hooks}/invite.js`).scheduleAutoReminders();
  } catch (err) {
    $app.logger().error("eventi auto reminders failed", "error", String(err));
  }
  try {
    require(`${__hooks}/outbox.js`).runDue();
  } catch (err) {
    $app.logger().error("eventi outbox run failed", "error", String(err));
  }
});

// Nightly: drop sent and failed outbox jobs after 30 days
cronAdd("eventiOutboxCleanup", "45 3 * * *", () => {
  require(`${__hooks}/outbox.js`).cleanup();
});

// Deliver due jobs now (superuser only; ?all=1 also delivers jobs that are not due yet).
// Used by the tests instead of waiting for the cron job, and in emergencies.
routerAdd("POST", "/api/eventi/outbox/run", (e) => {
  if (!e.hasSuperuserAuth()) throw new ForbiddenError("err.forbidden");
  const outbox = require(`${__hooks}/outbox.js`);
  if (e.request.url.query().get("auto") === "1") require(`${__hooks}/invite.js`).scheduleAutoReminders();
  return e.json(200, outbox.runDue({ all: e.request.url.query().get("all") === "1" }));
});
