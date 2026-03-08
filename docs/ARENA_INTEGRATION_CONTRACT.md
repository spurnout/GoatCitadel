# Arena Integration Contract

## Scope

This document defines what GoatCitadel expects from the optional `Arena` add-on for safe install, launch, health evaluation, and external opening from Mission Control.

## Current operating model

Arena is a separate-repo optional extra. GoatCitadel does not vendor the Arena codebase and does not embed Arena inside the main app shell for this cycle.

Current launch/display model:

1. GoatCitadel installs Arena into `~/.GoatCitadel/addons/arena`
2. GoatCitadel starts Arena as a separate local process
3. Arena serves its built web UI from the same server process
4. GoatCitadel opens Arena through a stable external local URL

## Required install and launch contract

Arena must provide:

1. a stable repository URL
2. deterministic install, build, and start commands
3. host/port configuration through environment variables
4. a health endpoint that reports both API and UI readiness
5. a stable external web entry path

## Expected Arena runtime contract

GoatCitadel currently expects Arena to run on:

- host: `127.0.0.1`
- port: `3099`
- launch URL: `http://127.0.0.1:3099/`

Canonical environment values used by GoatCitadel when launching Arena:

- `ARENA_HOST=127.0.0.1`
- `ARENA_PORT=3099`
- `CORS_ORIGIN=http://127.0.0.1:3099`
- `GOATCITADEL_BASE_URL=http://127.0.0.1:8787`

## Health contract

Arena `GET /health` must return a JSON payload with at least:

```json
{
  "status": "ok",
  "timestamp": "2026-03-08T00:00:00.000Z",
  "service": "arena-server",
  "uiReady": true,
  "uiEntryPath": "/"
}
```

GoatCitadel treats Arena as display-ready only when:

1. `status === "ok"`
2. `uiReady === true`

If Arena is up but `uiReady` is false, GoatCitadel keeps Arena in an error/not-ready state rather than exposing a broken launch surface.

## Web entry expectations

Arena must serve its production SPA from the server root:

- `GET /` returns the built Arena web app when the web build exists
- deep links like `/matches/:id` resolve through SPA fallback
- if the web build is missing, Arena should return an explicit diagnostic response instead of a silent 404

## WebSocket contract

Arena match subscriptions must use the path-based route:

- canonical per-match stream: `/ws/:matchId`

GoatCitadel assumes Arena web clients use the path-based route instead of query-param filtering on `/ws`.

## GoatCitadel UX expectations

Mission Control Add-ons should:

1. require explicit separate-repo download confirmation before install
2. show provenance and trust metadata before install
3. show readiness checks for build output and runtime health
4. expose `Open Arena` only while Arena is running and UI-ready
5. open Arena externally in a new local browser tab/window

## Non-goals for this cycle

- no iframe or embedded proxy integration
- no GoatCitadel-managed routing into Arena pages
- no GoatCitadel mutation of Arena gameplay logic
