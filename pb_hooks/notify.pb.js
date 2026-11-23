/// <reference path="../pb_data/types.d.ts" />

// Sends due mails once a minute: owner digests and final dates (notify.js),
// survey invitations and reminders (invite.js).
cronAdd("eventiNotify", "* * * * *", () => {
  const jobs = [
    ["digest", () => require(`${__hooks}/notify.js`).sendDigests()],
    ["final", () => require(`${__hooks}/notify.js`).sendFinals()],
    ["invitations", () => require(`${__hooks}/invite.js`).sendInvitations()],
    ["auto reminders", () => require(`${__hooks}/invite.js`).scheduleAutoReminders()],
    ["reminders", () => require(`${__hooks}/invite.js`).sendReminders()],
  ];
  for (let i = 0; i < jobs.length; i++) {
    try {
      jobs[i][1]();
    } catch (err) {
      $app.logger().error("eventi " + jobs[i][0] + " failed", "error", String(err));
    }
  }
});
