// Survey rules (see GLOSSARY.md) as sent by the server in /api/eventi/config: limits, result
// visibility modes and default settings. The browser checks against these for instant feedback;
// the server stays the authority and validates again.
import { appConfig } from "./i18n.js";

// Last-resort values if the config could not be loaded (the server still validates)
const FALLBACK = {
  limits: {
    title: 200, description: 2000, question_label: 300, option: 200, name: 60, text: 2000, comment: 1000,
    questions: 20, options: 50, options_min: 2, slots: 200, responses: 100,
  },
  results: ["always", "after_vote", "hidden"],
  defaults: { results: "always", allow_edit: true, require_login: false },
};

const rules = () => appConfig().rules || FALLBACK;

// limit("title") -> 200
export const limit = (name) => rules().limits[name] ?? FALLBACK.limits[name];
export const resultModes = () => rules().results;
export const defaultSettings = () => ({ ...rules().defaults });
