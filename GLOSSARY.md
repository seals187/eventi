# eventi

Self-hosted polls and date finding: an owner asks a group a few questions (usually "when?"), participants answer, and the owner confirms the result.

## Language

### Surveys

**Survey**:
A set of questions an owner puts to a group, reachable through one public link.
_Avoid_: Poll (UI wording only), Umfrage (in code), form

**Question**:
One item of a survey: a schedule question (dates), a choice question (options) or a free-text question.
_Avoid_: Field, item

**Slot**:
One date (all day) or one date with a time offered in a schedule question.
_Avoid_: Date option, appointment

**Final date**:
The slot the owner confirmed as the result of a schedule question.
_Avoid_: Chosen date, winner

**Favourite**:
The slot with the most "yes" answers (ties broken by "maybe") before a final date is confirmed.
_Avoid_: Best option, leader

**Survey rules**:
The limits and settings that decide what a valid survey and a valid response look like (lengths, counts, who sees results, whether answers can be changed, whether an account is required).
_Avoid_: Validation, config

### People and access

**Owner**:
The account that created a survey; it can always manage it.
_Avoid_: Creator, author

**Admin link**:
The secret link that grants management of one survey to whoever holds it, with or without an account.
_Avoid_: Admin key (in prose), management URL

**Participant**:
Whoever is answering a survey right now, identified by their credentials.
_Avoid_: Voter, respondent, user (when no account is meant)

**Credentials**:
What identifies a participant towards one survey: an account, a personal invitation link or the edit key of their own response — in that order of precedence.
_Avoid_: Auth, token (in prose)

**Response**:
Everything one participant submitted to a survey: a name, an answer per question and an optional comment.
_Avoid_: Vote, submission, answer (for the whole)

**Answer**:
A participant's reply to one question within a response; for schedule questions "yes", "maybe" or "no" per slot, where a missing slot means "no".
_Avoid_: Choice, selection

**Invitation**:
A personal invitation of one email address to one survey; its link lets that person respond without an account.
_Avoid_: Invite link (in prose), guest

**Account**:
A registered person who can sign in, create surveys and, if required by a survey, respond with their account name.
_Avoid_: User (when the role is meant), login

**Admin**:
An account allowed to manage other accounts.
_Avoid_: Superuser (that is the database administrator), moderator

**Sign-up mode**:
How new accounts come into existence: by invitation only, by company domain, after approval, or open.
_Avoid_: Registration type

### Email

**Reminder**:
An email to invited people who have not responded yet, sent automatically before closing or on the owner's request.
_Avoid_: Nudge, follow-up

**Digest**:
One email summarising the new responses to a survey for its owner.
_Avoid_: Notification (too general)

**Outbox**:
The emails eventi owes someone, each due at a certain time and tracked until it is sent or has finally failed.
_Avoid_: Mail queue, notifications

**Bundle**:
Emails of the same kind for the same survey that are merged into one, so a burst of changes sends a single email.
_Avoid_: Batch, debounce

**Locale**:
The language and date conventions used for one recipient or one page.
_Avoid_: Language (when date formats are meant too), i18n
