# PocketBase hooks and migrations: gotchas

eventi runs on PocketBase 0.40 (version: `PB_VERSION` in the `Dockerfile`). Hooks (`pb_hooks/*.pb.js`) and
migrations (`pb_migrations/*.js`) run in PocketBase's JavaScript VM (goja), not in Node.

## API reference

The JSVM API (`$app`, `routerAdd`, `onRecord…`, `Record`, field classes, …) is declared in
`pb_data/types.d.ts`. PocketBase writes that file on the first start; inside the test container it is
`/pb/pb_data/types.d.ts` (`docker exec eventi-test cat /pb/pb_data/types.d.ts | grep -n "routerAdd"`).
Check it before using a hook or method: not every Go hook exists in the JSVM (there is no `onServe`).

## Each handler runs in its own VM

Route handlers, hooks and cron callbacks run isolated. Functions or constants defined at file level in a
`*.pb.js` file are **not** visible inside a handler. Put shared code in a module (`pb_hooks/lib.js`,
`participant.js`, `outbox.js`, …) and `require(\`${__hooks}/name.js\`)` it inside the handler.

## Startup order

`onBootstrap` runs **before** the migrations. On the very first start new collections and fields do not
exist yet when `onBootstrap` fires. That is why `settings.pb.js` only runs `accounts.setup()` when the
users fields exist, and the users migration calls `accounts.setup()` itself.

## Migrations

- Files run once, in name order (`1763900300_outbox.js`); never edit a migration that was released,
  add a new one.
- A migration that drops fields must first carry over the data that still matters
  (see `1763900300_outbox.js`).
- Test a migration against a database of the previous release: run the previous image
  (`ghcr.io/seals187/eventi:<version>`) on a scratch volume, create the state, then start the new image
  on the same volume.

## Errors and responses

Throw `BadRequestError("err.some_key")` / `ForbiddenError` / `NotFoundError` / `UnauthorizedError` with an
i18n key as message; PocketBase capitalises it and appends a dot ("Err.some_key."), and `api.js errMsg()`
maps it back to a translation.
