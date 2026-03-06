# Arena Integration Contract

## Scope

This document defines what GoatCitadel expects from the optional `Arena` add-on for safe install, launch, and future in-app display support.

## Current assumption

Arena is currently treated as a separate-repo optional extra. GoatCitadel integrates it through the Add-ons subsystem only. GoatCitadel does not mutate the Arena repo directly.

## Minimum contract for install/launch support

Arena should provide:

1. stable repository URL
2. deterministic install/build/start commands
3. health endpoint returning service readiness
4. version metadata or package metadata that GoatCitadel can display
5. predictable host/port configuration through environment variables

## Current known local Arena behavior

Observed in the local `F:\code\goatcitadel-arena` tree:
- server package exists at `apps/server`
- `GET /health` returns an `ok` payload
- default runtime host/port are environment-driven
- no stable web app surface is currently present in the local tree

## Contract for future in-app display

To support `Open Arena` inside GoatCitadel, Arena should expose:

1. a stable web UI entry path
2. a health endpoint that confirms both API and UI readiness where applicable
3. a version/metadata endpoint, or package metadata GoatCitadel can safely read
4. clear CORS or same-origin proxy expectations
5. optional adapter/config support for receiving GoatCitadel context later

## Degraded behavior until UI exists

If Arena has no stable web UI entry yet, GoatCitadel should:
- allow install
- allow launch
- show health/readiness diagnostics
- provide external links only when a stable URL exists
- avoid pretending Arena is embeddable before the contract is met
