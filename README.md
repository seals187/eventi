# eventi

Leichtgewichtiges Umfrage- und Terminfindungs-Tool mit Benutzerkonten.
HTML/CSS/Vanilla-JS, PocketBase (SQLite) als Backend, ein einziger Container.

- **Terminfindung** (Ja / Vielleicht / Nein pro Zeitslot), **Auswahlfragen** (einfach/mehrfach), **Freitext** – beliebig kombinierbar in einer Umfrage
- **Konten**: Umfragen erstellen nur mit Login (Code per Mail oder Passwort); „Meine Umfragen“ auf jedem Gerät
- **Teilnahme** wahlweise ohne Konto (Name + Schlüssel im Browser) oder pro Umfrage **nur mit Konto** (eindeutig, eine Stimme pro Person)
- **Personen zu einer Umfrage einladen**: jede bekommt einen persönlichen Link (Abstimmen auch ohne Konto); du siehst, wer schon abgestimmt hat. Offene werden 24 h vor Schluss automatisch erinnert, oder per Knopf
- **Registrierung** per Einladung, Firmen-Domain, Freischaltung durch Admin oder offen – kombinierbar; Benutzerverwaltung für Admins
- **Mails** über beliebigen SMTP-Server (intern, Gmail, …): Login-Codes, Einladungen, Zusammenfassung neuer Antworten, finaler Termin
- Verwaltungslink bleibt zusätzlich gültig (z. B. zum Weitergeben an Mit-Verwaltende)
- Live-Ergebnisse (PocketBase Realtime/SSE), finalen Termin festlegen + `.ics`-Download, CSV-Export
- UI und Mails auf Deutsch, Englisch, Französisch; Dark Mode, mobil optimiert, kein Build-Schritt

## Start

```bash
cp .env.example .env      # optional anpassen
docker compose up -d --build
```

App: http://localhost:8090 · PocketBase-Dashboard: http://localhost:8090/_/
(Superuser über `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` in `.env`, oder `docker compose exec eventi /pb/pocketbase superuser upsert MAIL PASS`).

Entwicklung mit live gemounteten Dateien (Hooks laden bei Änderung automatisch neu):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Konfiguration (`.env`)

Alle Einstellungen stehen in `.env` (Vorlage: `.env.example`). Änderungen übernehmen mit `docker compose up -d`,
`PB_VERSION` erfordert `docker compose up -d --build`. Die Werte werden bei jedem Start angewendet und überschreiben
entsprechende Änderungen im Dashboard.

| Variable | Standard | Bedeutung |
|---|---|---|
| `EVENTI_PORT` | `8090` | Port auf dem Host |
| `EVENTI_BIND_IP` | `127.0.0.1` | IP für den direkten HTTP-Zugang (`0.0.0.0` = ganzes Netz) |
| `TZ` | `Europe/Zurich` | Zeitzone des Containers |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | – | Superuser fürs Dashboard `/_/` (wird beim Start angelegt/aktualisiert) |
| `PB_VERSION` | `0.40.5` | PocketBase-Version im Image |
| `EVENTI_APP_NAME` | `eventi` | Name im Dashboard |
| `EVENTI_DEFAULT_LANG` | `de` | Fallback-Sprache, wenn die Browsersprache nicht de/en/fr ist |
| `EVENTI_MAX_RESPONSES` | `100` | Max. Teilnehmende pro Umfrage |
| `EVENTI_RETENTION_DAYS` | `0` | Umfragen ohne Aktivität nach N Tagen löschen (0 = nie) |
| `EVENTI_RATE_LIMIT` | `true` | Rate-Limiting pro IP an/aus |
| `EVENTI_RATE_LIMIT_CREATE` | `10` | Neue Umfragen pro Minute |
| `EVENTI_RATE_LIMIT_API` | `120` | API-Aufrufe pro Minute |
| `EVENTI_TRUSTED_PROXY_HEADER` | – | Hinter Reverse Proxy: IP-Header, z. B. `X-Forwarded-For` (sonst gilt das Rate-Limit pro Proxy statt pro Nutzer) |

## Konten & Mail

Erster Admin ist `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` (wird beim ersten Start angelegt). Weitere Personen
lädt er unter **Konto-Menü → Benutzer** ein, oder sie registrieren sich je nach `EVENTI_SIGNUP` selbst.

| Variable | Standard | Bedeutung |
|---|---|---|
| `EVENTI_APP_URL` | `http://localhost:8090` | Öffentliche Adresse – für Links in Mails |
| `EVENTI_SIGNUP` | `invite` | `invite`, `domain`, `approval`, `open` (kombinierbar, z. B. `domain,approval`) |
| `EVENTI_SIGNUP_DOMAINS` | – | Domains für Selbstregistrierung ohne Freischaltung, z. B. `firma.ch` (braucht Mail) |
| `EVENTI_SESSION_DAYS` | `30` | Gültigkeit eines Logins (verlängert sich bei jedem Besuch) |
| `EVENTI_SMTP_HOST` / `_PORT` | – / `587` | Mailserver; leer = kein Mailversand, nur Passwort-Login |
| `EVENTI_SMTP_USER` / `_PASSWORD` | – | Zugangsdaten (bei internem Relay leer lassen) |
| `EVENTI_SMTP_TLS` | `true` bei Port 465 | sonst STARTTLS |
| `EVENTI_MAIL_FROM` / `_FROM_NAME` | SMTP-User / `eventi` | Absender |
| `EVENTI_DIGEST_MINUTES` | `15` | Neue Antworten werden dem Besitzer höchstens so oft gesammelt gemeldet |
| `EVENTI_RATE_LIMIT_AUTH` | `20` | Login-/Registrierungs-/Code-Anfragen pro Minute und IP |

**Gmail:** `EVENTI_SMTP_HOST=smtp.gmail.com`, Port `587`, `EVENTI_SMTP_USER` = Gmail-Adresse,
`EVENTI_SMTP_PASSWORD` = [App-Passwort](https://myaccount.google.com/apppasswords) (setzt 2-Faktor-Anmeldung voraus).
Gmail versendet nur mit der eigenen Adresse bzw. einem bestätigten Alias als Absender.

Ohne Mailserver funktioniert alles mit Passwörtern: Admins legen Konten mit Startpasswort an; Code-Login,
Selbstregistrierung per Domain, Passwort-Reset und Benachrichtigungen entfallen.

## Tests

```bash
bash tests/docker-test.sh
```

Baut ein Test-Image, startet es isoliert mit [Mailpit](https://mailpit.axllent.org/) als Test-Mailserver (es verlässt
keine Mail den Rechner) und führt `tests/smoke.sh` (API, Rechte) und `tests/mail.sh` (Registrierung, Code-Login,
Einladung, Benachrichtigungen) aus. Die eigene `.env` und der laufende Container bleiben unberührt.

Danach laufen die Test-Container weiter zum Ausprobieren: eventi auf http://127.0.0.1:8098
(Admin `admin@test.local` / `adminpass123`), Mailpit mit allen Mails und Login-Codes auf http://127.0.0.1:8025.
Entfernen mit `docker rm -f eventi-test eventi-mailpit` oder gleich `CLEAN=1 bash tests/docker-test.sh`.

## HTTPS (intern, eigenes Zertifikat)

Optionaler Caddy-Container vor eventi, nur aus internen Netzen erreichbar.

1. Zertifikat als PEM nach `./certs/` legen: `fullchain.pem` (Zertifikat + Zwischenzertifikate) und `privkey.pem` (unverschlüsselt).
2. In `.env` setzen: `COMPOSE_PROFILES=https`, `EVENTI_DOMAIN`, `EVENTI_HTTPS_BIND_IP` (interne IP des Hosts),
   `EVENTI_ALLOWED_IPS`, `EVENTI_TRUSTED_PROXY_HEADER=X-Forwarded-For`.
3. Im internen DNS `EVENTI_DOMAIN` auf die interne IP zeigen lassen, dann `docker compose up -d`.

| Variable | Standard | Bedeutung |
|---|---|---|
| `COMPOSE_PROFILES` | – | `https` aktiviert Caddy |
| `EVENTI_DOMAIN` | `eventi.example.ch` | Hostname (bei Wildcards nur eine Ebene unter der Domain) |
| `EVENTI_HTTPS_BIND_IP` | `0.0.0.0` | IP, auf der Caddy 80/443 öffnet – interne IP eintragen |
| `EVENTI_ALLOWED_IPS` | `private_ranges` | Erlaubte Netze (CIDR, mit Leerzeichen getrennt), alles andere wird abgewiesen |
| `EVENTI_CERT_DIR` | `./certs` | Ordner mit `fullchain.pem` und `privkey.pem` |

Zertifikat erneuern: neue Dateien nach `./certs/`, dann `docker compose restart caddy`.

## Aufbau

```
pb_migrations/   Schema (surveys, responses, users-Erweiterung) – Collection-Rules gesperrt
pb_hooks/        main.pb.js   Umfrage-API /api/eventi/*        lib.js     Validierung, Rechte
                 auth.pb.js   Registrierung, Login-Regeln, Benutzer-API, Systemmails
                 notify.*     Benachrichtigungen (Cron)        mail.js    Mailtexte de/en/fr
                 settings.pb.js / accounts.js   .env → PocketBase-Einstellungen, Admin-Konto
pb_public/       index.html (erstellen), s.html (abstimmen), a.html (verwalten),
                 login.html, account.html, users.html
  js/            ES-Module ohne Build; i18n/*.json für Übersetzungen
tests/           docker-test.sh, smoke.sh, mail.sh
```

### API

Auth: `Authorization: <token>` (Login über PocketBase: `/api/collections/users/auth-with-password`,
`request-otp` + `auth-with-otp`), zusätzlich die geheimen Schlüssel aus den Links.

| Methode | Pfad | Berechtigung |
|---|---|---|
| `GET` | `/api/eventi/config` | – (Sprache, Mail an/aus, Registrierungsmodus) |
| `POST` | `/api/eventi/surveys` | Login → liefert `id` + `admin_key` |
| `GET` | `/api/eventi/surveys/{id}` | optional Login, `X-Admin-Key`, `X-Invite-Token` bzw. `X-Response-Id` + `X-Edit-Key` |
| `PATCH`/`DELETE` | `/api/eventi/surveys/{id}` | Besitzer oder `X-Admin-Key` |
| `POST` | `/api/eventi/surveys/{id}/responses` | – bzw. Login bei `require_login` → liefert `id` + `edit_key` |
| `PATCH` | `/api/eventi/responses/{id}` | `X-Edit-Key` oder eigenes Konto |
| `DELETE` | `/api/eventi/responses/{id}` | `X-Edit-Key`, eigenes Konto, Besitzer oder `X-Admin-Key` |
| `GET`/`PATCH` | `/api/eventi/me` | Login (Name, Sprache, `mail_opt_out`) |
| `GET` | `/api/eventi/me/surveys` | Login |
| `GET`/`POST` | `/api/eventi/surveys/{id}/invitations` | Besitzer oder `X-Admin-Key` (Liste, Einladen: `{"emails": "..."}`) |
| `POST` | `/api/eventi/surveys/{id}/invitations/remind` | Besitzer oder `X-Admin-Key` |
| `DELETE` | `/api/eventi/invitations/{id}` | Besitzer oder `X-Admin-Key` |
| `GET`/`POST` | `/api/eventi/users` | Admin (Liste, Einladen) |
| `PATCH`/`DELETE` | `/api/eventi/users/{id}` | Admin (Freischalten, Sperren, Rolle, Passwort, Löschen inkl. Umfragen) |

Realtime: `/api/realtime` abonnieren mit Topic `eventi:<surveyId>` → Event `{"t":"changed"}`.

## Backup

Alle Daten liegen im Volume `eventi_data` (`/pb/pb_data`). Backups über das Dashboard (*Settings → Backups*) oder das Volume sichern.
