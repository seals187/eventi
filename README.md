# eventi

Leichtgewichtiges Umfrage- und Terminfindungs-Tool – ohne Anmeldung.
HTML/CSS/Vanilla-JS, PocketBase (SQLite) als Backend, ein einziger Container.

- **Terminfindung** (Ja / Vielleicht / Nein pro Zeitslot), **Auswahlfragen** (einfach/mehrfach), **Freitext** – beliebig kombinierbar in einer Umfrage
- Geheimer Verwaltungslink statt Accounts; Teilnehmende können ihre Antwort ändern (über einen Schlüssel im Browser)
- Live-Ergebnisse (PocketBase Realtime/SSE), finalen Termin festlegen + `.ics`-Download, CSV-Export
- UI auf Deutsch, Englisch, Französisch (automatisch nach Browsersprache, umschaltbar)
- Dark Mode, mobil optimiert, kein Build-Schritt

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
pb_migrations/   Schema (surveys, responses) – alle Collection-Rules gesperrt
pb_hooks/        API unter /api/eventi/* inkl. Validierung (main.pb.js, lib.js)
pb_public/       Frontend: index.html (erstellen), s.html (abstimmen), a.html (verwalten)
  js/            ES-Module ohne Build; i18n/*.json für Übersetzungen
```

### API

| Methode | Pfad | Auth-Header |
|---|---|---|
| `POST` | `/api/eventi/surveys` | – → liefert `id` + `admin_key` |
| `GET` | `/api/eventi/surveys/{id}` | optional `X-Admin-Key` bzw. `X-Response-Id` + `X-Edit-Key` |
| `PATCH`/`DELETE` | `/api/eventi/surveys/{id}` | `X-Admin-Key` |
| `POST` | `/api/eventi/surveys/{id}/responses` | – → liefert `id` + `edit_key` |
| `PATCH` | `/api/eventi/responses/{id}` | `X-Edit-Key` |
| `DELETE` | `/api/eventi/responses/{id}` | `X-Edit-Key` oder `X-Admin-Key` |

Realtime: `/api/realtime` abonnieren mit Topic `eventi:<surveyId>` → Event `{"t":"changed"}`.

## Backup

Alle Daten liegen im Volume `eventi_data` (`/pb/pb_data`). Backups über das Dashboard (*Settings → Backups*) oder das Volume sichern.
