/// <reference path="../pb_data/types.d.ts" />

// All API rules are null (superuser only): clients go through the
// custom /api/eventi/* routes in pb_hooks, which check the secret keys.
migrate((app) => {
  const surveys = new Collection({
    type: "base",
    name: "surveys",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "title", required: true, max: 200 },
      { type: "text", name: "description", max: 2000 },
      { type: "json", name: "questions", maxSize: 200000 },
      { type: "json", name: "settings", maxSize: 2000 },
      { type: "json", name: "final", maxSize: 2000 },
      { type: "bool", name: "closed" },
      { type: "date", name: "closes_at" },
      { type: "text", name: "admin_key", hidden: true },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(surveys);

  const responses = new Collection({
    type: "base",
    name: "responses",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "survey", collectionId: surveys.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 60 },
      { type: "json", name: "answers", maxSize: 50000 },
      { type: "text", name: "edit_key", hidden: true },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_responses_survey ON responses (survey)"],
  });
  app.save(responses);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("responses"));
  app.delete(app.findCollectionByNameOrId("surveys"));
});
