# eventi

Lightweight, self-hosted tool for polls and finding dates – with user accounts, personal invitations and reminders.
HTML/CSS/vanilla JS on top of [PocketBase](https://pocketbase.io) (SQLite), shipped as a single container. No build step.

- **Find a date** (yes / maybe / no per time slot), **choice questions** (single/multiple) and **free text** – combinable in one poll
- **Start from a template** (team dinner, meeting, birthday, outing, feedback) or duplicate your last poll
- **Three views for participants:** overview with the current favourite, *my answer* with an optional comment, and a matrix of *all answers*
- **Accounts:** creating polls requires a login (one-time code by email or password); “My polls” on every device
- **Participation** without an account (name + key in the browser) or, per poll, **only with an account** (one vote per person)
- **Invite people to a poll:** everyone gets a personal link (voting without an account), you see who has voted,
  pending people are reminded automatically 24 h before closing or with one click
- **Sign-up** by invitation, company domain, admin approval or open – combinable; user management for admins
- **Email** through any SMTP server (internal relay, Gmail, …): sign-in codes, invitations, summaries of new answers, confirmed date
- Admin link stays valid in addition (e.g. to share with co-organisers); QR code for the poll link
- Live results (PocketBase realtime/SSE), confirm the final date + `.ics` download, CSV export
- UI and emails in German, English and French; dark mode, mobile friendly

## Quick start

```bash
cp .env.example .env      # adjust as needed
docker compose up -d --build
```

App: http://localhost:8090 · PocketBase dashboard: http://localhost:8090/_/

The first eventi admin (and dashboard superuser) is `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` from `.env`.

A prebuilt image is published for every release:

```bash
docker pull ghcr.io/seals187/eventi:latest      # or a fixed version, e.g. :0.0.3
```

Development with live-mounted files (hooks reload automatically on change):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Configuration (`.env`)

All settings live in `.env` (template: `.env.example`). Apply changes with `docker compose up -d`;
`PB_VERSION` requires `docker compose up -d --build`. Values are applied on every start and override the
corresponding settings in the dashboard.

| Variable | Default | Meaning |
|---|---|---|
| `EVENTI_PORT` | `8090` | Port on the host |
| `EVENTI_BIND_IP` | `127.0.0.1` | IP for direct HTTP access (`0.0.0.0` = whole network) |
| `TZ` | `Europe/Zurich` | Time zone of the container (also used for times in emails) |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | – | Dashboard superuser and first eventi admin (password only set when the account is created) |
| `PB_VERSION` | `0.40.5` | PocketBase version in the image |
| `EVENTI_APP_NAME` | `eventi` | Name in the dashboard and in emails |
| `EVENTI_APP_URL` | `http://localhost:8090` | Public address, used for links in emails |
| `EVENTI_DEFAULT_LANG` | `de` | Fallback language if the browser language is not de/en/fr |
| `EVENTI_MAX_RESPONSES` | `100` | Max. participants per poll |
| `EVENTI_RETENTION_DAYS` | `0` | Delete polls without activity after N days (0 = never) |
| `EVENTI_RATE_LIMIT` | `true` | Rate limiting per IP on/off |
| `EVENTI_RATE_LIMIT_CREATE` | `10` | New polls per minute |
| `EVENTI_RATE_LIMIT_API` | `120` | API requests per minute |
| `EVENTI_RATE_LIMIT_AUTH` | `20` | Sign-in / sign-up / code requests per minute |
| `EVENTI_TRUSTED_PROXY_HEADER` | – | Behind a reverse proxy: client IP header, e.g. `X-Forwarded-For` |

### Accounts and email

| Variable | Default | Meaning |
|---|---|---|
| `EVENTI_SIGNUP` | `invite` | `invite`, `domain`, `approval`, `open` – combinable, e.g. `domain,approval` |
| `EVENTI_SIGNUP_DOMAINS` | – | Domains allowed to sign up without approval, e.g. `company.com` (needs email) |
| `EVENTI_SESSION_DAYS` | `30` | How long a login stays valid (renewed on every visit) |
| `EVENTI_SMTP_HOST` / `_PORT` | – / `587` | Mail server; empty = no email, password login only |
| `EVENTI_SMTP_USER` / `_PASSWORD` | – | Credentials (leave empty for an internal relay) |
| `EVENTI_SMTP_TLS` | `true` for port 465 | otherwise STARTTLS |
| `EVENTI_MAIL_FROM` / `_FROM_NAME` | SMTP user / `eventi` | Sender |
| `EVENTI_DIGEST_MINUTES` | `15` | Owners get new answers summarised at most this often |

**Gmail:** `EVENTI_SMTP_HOST=smtp.gmail.com`, port `587`, `EVENTI_SMTP_USER` = your Gmail address,
`EVENTI_SMTP_PASSWORD` = an [app password](https://myaccount.google.com/apppasswords) (requires 2-step verification).
Gmail only sends with your own address or a verified alias as sender.

Without a mail server everything works with passwords: admins create accounts with an initial password; sign-in
codes, domain sign-up, password reset, invitations and notifications are not available.

## HTTPS (internal, own certificate)

Optional Caddy container in front of eventi, reachable from internal networks only.

1. Put the certificate as PEM into `./certs/`: `fullchain.pem` (certificate + intermediates) and `privkey.pem` (unencrypted).
2. In `.env` set `COMPOSE_PROFILES=https`, `EVENTI_DOMAIN`, `EVENTI_HTTPS_BIND_IP` (internal IP of the host),
   `EVENTI_ALLOWED_IPS`, `EVENTI_TRUSTED_PROXY_HEADER=X-Forwarded-For` and `EVENTI_APP_URL=https://<domain>`.
3. Point `EVENTI_DOMAIN` to the internal IP in your internal DNS, then `docker compose up -d`.

| Variable | Default | Meaning |
|---|---|---|
| `COMPOSE_PROFILES` | – | `https` enables Caddy |
| `EVENTI_DOMAIN` | `eventi.example.ch` | Host name (with wildcard certificates only one level below the domain) |
| `EVENTI_HTTPS_BIND_IP` | `0.0.0.0` | IP Caddy listens on (80/443) – use the internal IP |
| `EVENTI_ALLOWED_IPS` | `private_ranges` | Allowed networks (CIDR, space separated), everything else is rejected |
| `EVENTI_CERT_DIR` | `./certs` | Folder with `fullchain.pem` and `privkey.pem` |

Renew the certificate: copy the new files to `./certs/`, then `docker compose restart caddy`.

## Tests

```bash
bash tests/docker-test.sh
```

Builds a test image, starts it isolated together with [Mailpit](https://mailpit.axllent.org/) as test mail server
(no email leaves the machine) and runs `tests/smoke.sh` (API, permissions) and `tests/mail.sh` (sign-up, code login,
invitations, reminders, notifications). Your `.env` and running containers are not touched.

Afterwards the test containers keep running for manual testing: eventi on http://127.0.0.1:8098
(admin `admin@test.local` / `adminpass123`) and Mailpit with all emails on http://127.0.0.1:8025.
Remove them with `docker rm -f eventi-test eventi-mailpit`, or run `CLEAN=1 bash tests/docker-test.sh`.

## Architecture

```
pb_migrations/   Schema (surveys, responses, invitations, users extension) – all collection rules locked
pb_hooks/        main.pb.js        poll API /api/eventi/*          lib.js      validation, permissions
                 auth.pb.js        sign-up, login rules, user API   mail.js     email texts de/en/fr
                 invitations.pb.js invitation API                   invite.js   invitations, reminders
                 notify.pb.js      cron job for all emails          notify.js   digests, final date
                 settings.pb.js / accounts.js   .env -> PocketBase settings, admin account
pb_public/       index.html (create), s.html (vote), a.html (manage), login.html, account.html, users.html
  js/            ES modules without build; vendor/qrcode.js (MIT); i18n/*.json for translations
tests/           docker-test.sh, smoke.sh, mail.sh
```

### API

Authentication: `Authorization: <token>` (login via PocketBase: `/api/collections/users/auth-with-password`,
`request-otp` + `auth-with-otp`), plus the secret keys from the links.

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/eventi/config` | – (version, language, email on/off, sign-up mode) |
| `POST` | `/api/eventi/surveys` | login → returns `id` + `admin_key` |
| `GET` | `/api/eventi/surveys/{id}` | optional login, `X-Admin-Key`, `X-Invite-Token` or `X-Response-Id` + `X-Edit-Key` |
| `PATCH`/`DELETE` | `/api/eventi/surveys/{id}` | owner or `X-Admin-Key` |
| `POST` | `/api/eventi/surveys/{id}/responses` | – or login/invitation with `require_login` → returns `id` + `edit_key` |
| `PATCH` | `/api/eventi/responses/{id}` | `X-Edit-Key`, own account or personal invitation |
| `DELETE` | `/api/eventi/responses/{id}` | as above, or owner / `X-Admin-Key` |
| `GET`/`POST` | `/api/eventi/surveys/{id}/invitations` | owner or `X-Admin-Key` (list, invite: `{"emails": "..."}`) |
| `POST` | `/api/eventi/surveys/{id}/invitations/remind` | owner or `X-Admin-Key` |
| `DELETE` | `/api/eventi/invitations/{id}` | owner or `X-Admin-Key` |
| `GET`/`PATCH` | `/api/eventi/me` | login (name, language, `mail_opt_out`) |
| `GET` | `/api/eventi/me/surveys` | login |
| `GET`/`POST` | `/api/eventi/users` | admin (list, invite) |
| `PATCH`/`DELETE` | `/api/eventi/users/{id}` | admin (approve, block, role, password, delete incl. polls) |

Realtime: subscribe to `/api/realtime` with topic `eventi:<surveyId>` → event `{"t":"changed"}`.

## Backup

All data lives in the volume `eventi_data` (`/pb/pb_data`). Create backups in the dashboard (*Settings → Backups*) or back up the volume.

## License

[GNU AGPL-3.0](LICENSE). Bundled: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT).
