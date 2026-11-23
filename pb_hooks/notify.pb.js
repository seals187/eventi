/// <reference path="../pb_data/types.d.ts" />

// Sends due notification mails (see notify.js) once a minute.
cronAdd("eventiNotify", "* * * * *", () => {
  const n = require(`${__hooks}/notify.js`);
  try {
    n.sendDigests();
  } catch (err) {
    $app.logger().error("eventi digest failed", "error", String(err));
  }
  try {
    n.sendFinals();
  } catch (err) {
    $app.logger().error("eventi final mail failed", "error", String(err));
  }
});
