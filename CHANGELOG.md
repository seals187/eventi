# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.0.1]: https://github.com/seals187/eventi/releases/tag/v0.0.1
