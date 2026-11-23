# eventi

- Domain language (survey, participant, credentials, outbox, …): `GLOSSARY.md`
- Tests, lint, screenshots, ports: `docs/testing.md` – before finishing a change: `bash tests/lint.sh` and
  `bash tests/docker-test.sh` (leaves the test container running on port 8099)
- Writing hooks or migrations (`pb_hooks/`, `pb_migrations/`): `docs/pocketbase-hooks.md`
- Releasing: `bash scripts/release.sh <version>`
- Docs, code comments, commit messages and the CHANGELOG are in English
