# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Internal: one participant module on the server decides which response is the participant's own
  (account, then invitation, then edit key), whether they may respond, edit or see results, and their
  name; the voting page only reads these flags. Responding again with a stored edit key is now rejected
  as "already voted"
- Internal: one survey client in the browser (`surveyClient`) holds the survey id and credentials, so pages
  no longer know endpoints or header names; one server guard (`adminSurvey`) replaces seven copies of
  "find survey, check management right"; `/api/eventi/me/surveys` returns `admin_key` instead of `key`
- Internal: survey rules (limits, result modes, default settings, response limit) come from the server
  in `/api/eventi/config` (`rules`); the browser no longer hard-codes them. `max_responses` moved to
  `rules.limits.responses`
- Internal: all emails go through one outbox (`outbox` collection): email jobs with due time, bundles
  (digest, final date, reminders), one rule for who gets emails (accounts only while active and not opted
  out - also for the admin notice about pending sign-ups), retries after 1, 5 and 30 minutes, then
  `failed` (visible in the dashboard); cleanup after 30 days. A migration carries over pending emails and
  removes the old scheduling fields
- Internal: one server-side locale module (`locale.js`) for the language list, default language, the
  language of a recipient and email date formats; duplicate weekday tables removed

### Added
- `POST /api/eventi/outbox/run` (PocketBase superuser): deliver queued emails now; the test suite uses it
  and runs in about a minute instead of four

## [0.0.7] – 2026-11-23

### Changed
- Voting page on phones (< 600 px) much more compact: overview slots on two lines instead of four,
  “change answer” next to the status text, flatter “my answer” rows, narrower answer matrix
  (name column without time, smaller cells) – overview about 165 px shorter on a 390 px phone

### Added
- “QR code & poster” dialog on the admin page (QR icon): preview of a printable poster with title, optional
  description, link and closing date; print it, copy only the QR code or download the poster as PNG

## [0.0.6] – 2026-11-23

### Changed
- “My answer”: the comment field is one line high (like the example text) and grows with longer comments
- Settings chips on the start page keep their width when the value changes (space for the longest value
  is reserved); German chip label “Nach Antwort” instead of “Nach Abstimmung”
- “My answer” more compact: name field next to the heading, comment label in the date column next to the
  field, flatter buttons and a smaller page title – about 120 px shorter

## [0.0.5] – 2026-11-23

### Changed
- `.env` is now required: `docker compose` refuses to start without it, and `EVENTI_BIND_IP` / `EVENTI_PORT`
  must be set there (no silent defaults for the published port)

### Fixed
- Switching tabs (overview / my answer / all answers) no longer shifts the page sideways: the scrollbar
  space is always reserved (`scrollbar-gutter: stable`)

## [0.0.4] – 2026-11-23

### Changed
- `docker-compose.yml` uses the official image `ghcr.io/seals187/eventi:latest` instead of building locally;
  update with `docker compose pull && docker compose up -d`. `PB_VERSION` removed from `.env.example`
- Every release tag now also creates the GitHub release (CHANGELOG section as notes, marked as latest);
  README shows version badges that are always current

## [0.0.3] – 2026-11-23

### Added
- Display size control in the header (− / +, left of the account menu): 70 % to 110 % in 5 % steps,
  click the percentage to reset; stored per browser

### Changed
- Compact poll editor: smaller calendar (flat day cells), question options as small toggles in the
  card header, tighter spacing – a template like “Team dinner” fits on one laptop screen
- The account setting hint moved into the tooltip of the “Account” chip
- Admin page: two columns on wide screens (favourite, sharing and participants | answer matrix),
  more compact cards, ring and matrix rows; the reminder note became the button tooltip
- Voting page more compact: smaller tabs and rows; in “my answer” the date and the yes / maybe / no
  buttons share one line on wider screens
- Smaller base size: the default (eventi “100 %”) is 87.5 % of the previous size; − / + scale relative to it

## [0.0.2] – 2026-11-23

### Changed
- Sign-in with password is now the default; “use an email code instead” stays one click away.
  Invitation emails link to `login.html?mode=code`, because invited people have no password yet
- Start page redesign: “Start from a template” box with template pills and “duplicate last poll”,
  “or add a question directly” (find a date / vote / free text); after choosing, a template bar
  (change / remove), question cards with coloured type badges and compact “+ Question” chips
- Date list next to the calendar shows one row per day (date, times, “+ time”)
- “Create poll” is disabled until the poll has a question

### Added
- Deep link to a template: `/?tpl=dinner` (also `meeting`, `birthday`, `trip`, `feedback`)

## [0.0.1] – 2026-11-23

First public release.

### Polls
- Polls combining date finding (yes / maybe / no per slot), single or multiple choice and free text questions
- Start page with templates (team dinner, meeting, birthday, outing, feedback, blank) and “duplicate last poll”
- Settings as compact chips: who sees the results, answers editable, only with an account, closing time
- Voting page with three tabs: overview with the current favourite and group bars, *my answer* with an optional
  comment, and *all answers* as a matrix with the best date highlighted, sorting and CSV export
- Admin page with favourite and “confirm date”, share link with QR code, participant chips, invitations and
  the full answer matrix including pending invitees
- Live updates via PocketBase realtime, `.ics` download for the confirmed date, CSV export

### Accounts
- Login with a one-time code by email or with a password; password reset and email confirmation
- Sign-up modes `invite`, `domain`, `approval`, `open` (combinable); user management for admins
  (invite, approve, block, change role, delete)
- “My polls” stored in the account; owners manage their polls without the secret admin link
- Per poll “only with an account”: the account name is used and everyone votes once

### Invitations and email
- Invite people to a poll by email; personal links allow voting without an account and show who has voted
- Automatic reminder 24 h before closing (not for people invited in the last 12 h) and a manual “remind pending” button
- Digest of new answers for owners, email to participants when the date is confirmed
- Any SMTP server (internal relay, Gmail with app password, …); all emails in German, English and French

### Operations
- Single container (PocketBase 0.40.5), configuration through `.env`, optional Caddy for internal HTTPS
- Docker image `ghcr.io/seals187/eventi` built by GitHub Actions for every release tag (amd64, arm64)
- Test suite `tests/docker-test.sh`: isolated container with Mailpit, API and email flow tests;
  the test container keeps running for manual testing

[0.0.7]: https://github.com/seals187/eventi/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/seals187/eventi/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/seals187/eventi/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/seals187/eventi/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/seals187/eventi/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/seals187/eventi/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/seals187/eventi/releases/tag/v0.0.1
