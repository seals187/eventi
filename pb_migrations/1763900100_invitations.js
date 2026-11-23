/// <reference path="../pb_data/types.d.ts" />

// Invitations: people invited to a survey by email. Each gets a personal link
// (token), so eventi knows who has voted and can remind the others.
//   invite_sent  - invitation mail sent (empty = queued, sent by the cron job)
//   remind_due   - reminder queued for this time
//   reminded_at  - last reminder sent
// surveys.reminder_for = closes_at value the automatic reminder was scheduled for.
migrate((app) => {
  const surveys = app.findCollectionByNameOrId("surveys");
  const responses = app.findCollectionByNameOrId("responses");

  const inv = new Collection({
    type: "base",
    name: "invitations",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "survey", collectionId: surveys.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: "email", name: "email", required: true },
      { type: "text", name: "name", max: 60 },
      { type: "text", name: "token", hidden: true },
      { type: "relation", name: "response", collectionId: responses.id, maxSelect: 1, cascadeDelete: false },
      { type: "date", name: "invite_sent" },
      { type: "date", name: "remind_due" },
      { type: "date", name: "reminded_at" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_invitations_survey_email ON invitations (survey, email)",
      "CREATE UNIQUE INDEX idx_invitations_token ON invitations (token)",
      "CREATE INDEX idx_invitations_invite_sent ON invitations (invite_sent)",
      "CREATE INDEX idx_invitations_remind_due ON invitations (remind_due)",
    ],
  });
  app.save(inv);

  surveys.fields.add(new TextField({ name: "reminder_for", max: 40 }));
  app.save(surveys);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("invitations"));
  const surveys = app.findCollectionByNameOrId("surveys");
  surveys.fields.removeByName("reminder_for");
  app.save(surveys);
});
