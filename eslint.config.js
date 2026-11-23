// ESLint flat config – run with `bash tests/lint.sh` (uses the node Docker image, no package.json needed).
// Besides basic correctness it enforces the architecture rules from GLOSSARY.md mechanically.

const browserGlobals = Object.fromEntries([
  "window", "document", "location", "history", "localStorage", "navigator", "fetch", "URL", "URLSearchParams",
  "Blob", "ClipboardItem", "Node", "EventSource", "structuredClone", "Intl", "console", "confirm", "prompt",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
].map((g) => [g, "readonly"]));

// PocketBase JSVM (pb_hooks, pb_migrations); see pb_data/types.d.ts after the first start
const pocketbaseGlobals = Object.fromEntries([
  "$app", "$os", "$security", "$dbx", "$mails", "__hooks", "require", "module", "toString", "console",
  "routerAdd", "routerUse", "cronAdd", "migrate",
  "onBootstrap", "onRecordCreateRequest", "onRecordAuthRequest", "onRecordAuthWithOTPRequest",
  "onMailerRecordOTPSend", "onMailerRecordVerificationSend", "onMailerRecordPasswordResetSend", "onMailerSend",
  "Record", "Collection", "MailerMessage", "SubscriptionMessage",
  "TextField", "SelectField", "BoolField", "RelationField", "DateField", "JSONField",
  "BadRequestError", "ForbiddenError", "NotFoundError", "UnauthorizedError",
].map((g) => [g, "readonly"]));

const correctness = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
  "no-redeclare": "error",
  "no-dupe-keys": "error",
  "no-unreachable": "error",
  "no-self-assign": "error",
  "no-dupe-else-if": "error",
  "no-const-assign": "error",
  "no-import-assign": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
};

const ui = (selector, message) => ({ selector, message });

export default [
  { ignores: ["pb_public/js/vendor/**", "pb_data/**", "node_modules/**"] },

  // Frontend: ES modules in the browser
  {
    files: ["pb_public/js/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: browserGlobals },
    rules: {
      ...correctness,
      "no-restricted-syntax": ["error",
        // A false / 0 from `cond && h(...)` would be rendered as text by the native method
        ui("CallExpression[callee.property.name='replaceChildren'] > LogicalExpression",
          "Use setChildren(el, ...) from util.js for conditional children; replaceChildren renders false/0 as text."),
        ui("CallExpression[callee.property.name='replaceChildren'] > ConditionalExpression",
          "Use setChildren(el, ...) from util.js for conditional children."),
        // Survey rules come from the server (rules.js)
        ui("Property[key.name='maxlength'] > Literal",
          "Take limits from rules.js (limit(\"...\")), not as numbers."),
        // Header names only live in api.js (admin key) and credentials.js (participant)
        ui("Literal[value=/^X-(Admin-Key|Edit-Key|Response-Id|Invite-Token)$/]",
          "Request headers belong in api.js (surveyClient) or credentials.js."),
      ],
    },
  },
  {
    files: ["pb_public/js/api.js", "pb_public/js/credentials.js"],
    rules: { "no-restricted-syntax": "off" },
  },

  // Backend: PocketBase hooks and migrations (CommonJS-style scripts in the JSVM)
  {
    files: ["pb_hooks/**/*.js", "pb_migrations/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: pocketbaseGlobals },
    rules: {
      ...correctness,
      "no-restricted-syntax": ["error",
        // All emails go through the outbox (retries, bundles, one eligibility rule)
        ui("CallExpression[callee.property.name='deliver']",
          "Send emails through outbox.js (enqueue / sendNow), not mail.deliver directly."),
      ],
    },
  },
  {
    files: ["pb_hooks/outbox.js", "pb_hooks/mail.js"],
    rules: { "no-restricted-syntax": "off" },
  },
];
