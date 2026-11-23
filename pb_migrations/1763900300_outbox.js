/// <reference path="../pb_data/types.d.ts" />

// Outbox (see GLOSSARY.md and pb_hooks/outbox.js): one collection of email jobs replaces the
// scheduling markers on surveys (digest_due, digest_since, final_due, final_notified,
// reminder_for) and invitations (remind_due). Pending work is carried over as outbox jobs.
// invitations.invite_sent and reminded_at stay: they record facts shown in the UI.
migrate((app) => {
  const outbox = new Collection({
    type: "base",
    name: "outbox",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "kind", required: true, max: 40 },
      { type: "text", name: "bundle", max: 200 },
      { type: "json", name: "payload", maxSize: 20000 },
      { type: "date", name: "due_at", required: true },
      { type: "select", name: "status", values: ["pending", "sending", "sent", "failed"], maxSelect: 1, required: true },
      { type: "number", name: "attempts", onlyInt: true, min: 0 },
      { type: "text", name: "last_error", max: 500 },
      { type: "date", name: "sent_at" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_outbox_status_due ON outbox (status, due_at)",
      "CREATE INDEX idx_outbox_bundle ON outbox (bundle)",
    ],
  });
  app.save(outbox);

  const job = (kind, payload, dueAt, bundle, status) => {
    const r = new Record(outbox);
    r.set("kind", kind);
    r.set("payload", payload);
    r.set("due_at", dueAt || new Date().toISOString());
    r.set("bundle", bundle || "");
    r.set("status", status || "pending");
    r.set("attempts", 0);
    app.save(r);
  };
  const readJSON = (rec, field) => {
    try {
      return JSON.parse(rec.getString(field) || "{}") || {};
    } catch (_) {
      return {};
    }
  };

  // Carry over pending work
  const surveys = app.findRecordsByFilter("surveys", "digest_due != '' || final_due != '' || reminder_for != ''", "", 0, 0);
  for (const s of surveys) {
    if (s.getString("digest_due")) {
      job("digest", { survey: s.id, since: s.getString("digest_since") || s.getString("digest_due") }, s.getString("digest_due"), "digest:" + s.id);
    }
    if (s.getString("final_due")) {
      job("final", { survey: s.id, before: readJSON(s, "final_notified") }, s.getString("final_due"), "final:" + s.id);
    }
    // Automatic reminder already handled for this closing time
    if (s.getString("reminder_for")) {
      job("auto_reminders", { survey: s.id }, s.getString("reminder_for"), "auto-reminder:" + s.id + ":" + s.getString("reminder_for"), "sent");
    }
  }
  const invitations = app.findRecordsByFilter("invitations", "remind_due != '' || invite_sent = ''", "", 0, 0);
  for (const inv of invitations) {
    if (!inv.getString("invite_sent")) job("survey_invite", { invitation: inv.id });
    if (inv.getString("remind_due")) job("reminder", { invitation: inv.id }, inv.getString("remind_due"), "reminder:" + inv.id);
  }

  // Drop the old scheduling markers
  const sc = app.findCollectionByNameOrId("surveys");
  sc.removeIndex("idx_surveys_digest_due");
  sc.removeIndex("idx_surveys_final_due");
  for (const f of ["digest_due", "digest_since", "final_due", "final_notified", "reminder_for"]) sc.fields.removeByName(f);
  app.save(sc);
  const ic = app.findCollectionByNameOrId("invitations");
  ic.removeIndex("idx_invitations_remind_due");
  ic.fields.removeByName("remind_due");
  app.save(ic);
}, (app) => {
  const sc = app.findCollectionByNameOrId("surveys");
  sc.fields.add(new DateField({ name: "digest_due" }));
  sc.fields.add(new DateField({ name: "digest_since" }));
  sc.fields.add(new DateField({ name: "final_due" }));
  sc.fields.add(new JSONField({ name: "final_notified", maxSize: 2000 }));
  sc.fields.add(new TextField({ name: "reminder_for", max: 40 }));
  sc.addIndex("idx_surveys_digest_due", false, "digest_due", "");
  sc.addIndex("idx_surveys_final_due", false, "final_due", "");
  app.save(sc);
  const ic = app.findCollectionByNameOrId("invitations");
  ic.fields.add(new DateField({ name: "remind_due" }));
  ic.addIndex("idx_invitations_remind_due", false, "remind_due", "");
  app.save(ic);
  app.delete(app.findCollectionByNameOrId("outbox"));
});
