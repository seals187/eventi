# Testing

## Commands

| Command | What it does |
|---|---|
| `bash tests/lint.sh` | ESLint (node Docker image) incl. the architecture rules in `eslint.config.js` |
| `bash tests/docker-test.sh` | builds the image, starts it with Mailpit, runs `smoke.sh` + `mail.sh`, adds a demo poll |
| `bash tests/screenshot.sh PATH [options]` | screenshot of a page in the running test container (options: see the script header) |

CI (`.github/workflows/test.yml`) runs lint and the test suite on every push to `main` and every pull request.
The pre-commit hook (`.githooks/pre-commit`, enable with `git config core.hooksPath .githooks`) runs lint.

## Ports

| Port | What |
|---|---|
| 8099 | test container `eventi-test` (admin `admin@test.local` / `adminpass123`, env set in `tests/docker-test.sh`) |
| 8025 | Mailpit web UI with all test emails |
| `EVENTI_PORT` | the local installation (`docker compose`, credentials from `.env`) – leave it alone in tests |

## Writing tests

- `smoke.sh` / `mail.sh` are plain bash + curl. Read JSON with `jpath a.b.c` (smoke.sh, perl JSON::PP);
  the `grep -o '"key":"…"'` helpers break on nested objects and random key order.
- Emails: `flush` (mail.sh) delivers everything queued in the outbox through the superuser route
  `POST /api/eventi/outbox/run?all=1&auto=1` instead of waiting for the cron job.
- **Non-ASCII test data on Windows (Git Bash):** command-line arguments to `curl.exe` lose characters like
  "ü". Send JSON through stdin (`printf '%s' "$json" | curl … --data-binary @-` or a heredoc), as
  `tests/seed-demo.sh` does.
- The test container runs with `EVENTI_MAX_RESPONSES=10`, `EVENTI_DIGEST_MINUTES=0`, rate limiting off and
  `EVENTI_SIGNUP=domain,approval` (`firma.ch`).

## Checking the UI

The API tests do not load the frontend. After UI changes run lint, then look at the pages with
`tests/screenshot.sh` (desktop, `--mobile`, `--light`, `--click` for dialogs). Headless browsers render no
narrower than ~500 px, hence the `--mobile` frame.
