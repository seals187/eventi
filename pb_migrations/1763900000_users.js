/// <reference path="../pb_data/types.d.ts" />

// User accounts: extends PocketBase's built-in "users" auth collection and
// links surveys (owner) and responses (user) to it.
//
// users.status: "active" may log in, "pending" waits for approval by an admin,
// "blocked" was disabled by an admin. Checked in pb_hooks/auth.pb.js.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({ name: "role", values: ["user", "admin"], maxSelect: 1 }));
  users.fields.add(new SelectField({ name: "status", values: ["active", "pending", "blocked"], maxSelect: 1 }));
  users.fields.add(new TextField({ name: "lang", max: 5 }));
  users.fields.add(new BoolField({ name: "mail_opt_out" }));

  // Users only see themselves. Sign-up goes through the public create rule but is
  // gated (and role/status forced) by the onRecordCreateRequest hook.
  // Self-updates may not touch role, status or verified.
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = "";
  users.updateRule = "id = @request.auth.id && @request.body.role:isset = false && @request.body.status:isset = false && @request.body.verified:isset = false";
  users.deleteRule = null;
  users.passwordAuth.identityFields = ["email"];
  users.otp.length = 6;
  users.otp.duration = 600;
  app.save(users);

  const surveys = app.findCollectionByNameOrId("surveys");
  surveys.fields.add(new RelationField({ name: "owner", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  // Owner notifications: digest of new responses is due at digest_due, covering responses since digest_since
  surveys.fields.add(new DateField({ name: "digest_due" }));
  surveys.fields.add(new DateField({ name: "digest_since" }));
  // Participant notification about the final date: due at final_due, final_notified = last state mailed
  surveys.fields.add(new DateField({ name: "final_due" }));
  surveys.fields.add(new JSONField({ name: "final_notified", maxSize: 2000 }));
  surveys.addIndex("idx_surveys_owner", false, "owner", "");
  surveys.addIndex("idx_surveys_digest_due", false, "digest_due", "");
  surveys.addIndex("idx_surveys_final_due", false, "final_due", "");
  app.save(surveys);

  const responses = app.findCollectionByNameOrId("responses");
  responses.fields.add(new RelationField({ name: "user", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  // One response per account and survey (anonymous responses are not limited)
  responses.addIndex("idx_responses_survey_user", true, "survey, user", "user != ''");
  app.save(responses);

  // First start: settings.pb.js ran before this migration, so apply the account setup now
  require(`${__hooks}/accounts.js`).setup(app);
}, (app) => {
  const responses = app.findCollectionByNameOrId("responses");
  responses.removeIndex("idx_responses_survey_user");
  responses.fields.removeByName("user");
  app.save(responses);

  const surveys = app.findCollectionByNameOrId("surveys");
  surveys.removeIndex("idx_surveys_owner");
  surveys.removeIndex("idx_surveys_digest_due");
  surveys.removeIndex("idx_surveys_final_due");
  for (const f of ["owner", "digest_due", "digest_since", "final_due", "final_notified"]) surveys.fields.removeByName(f);
  app.save(surveys);

  const users = app.findCollectionByNameOrId("users");
  for (const f of ["role", "status", "lang", "mail_opt_out"]) users.fields.removeByName(f);
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = "id = @request.auth.id";
  app.save(users);
});
