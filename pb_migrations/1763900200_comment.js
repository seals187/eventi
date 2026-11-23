/// <reference path="../pb_data/types.d.ts" />

// Optional comment per response ("Am 26. bin ich leider auf Dienstreise.")
migrate((app) => {
  const responses = app.findCollectionByNameOrId("responses");
  responses.fields.add(new TextField({ name: "comment", max: 1000 }));
  app.save(responses);
}, (app) => {
  const responses = app.findCollectionByNameOrId("responses");
  responses.fields.removeByName("comment");
  app.save(responses);
});
