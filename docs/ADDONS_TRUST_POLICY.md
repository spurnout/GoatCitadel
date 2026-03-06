# Add-ons Trust Policy

## Purpose

GoatCitadel Add-ons are optional extras that install and run code outside the core GoatCitadel app checkout. They are not required for core operations.

## Non-negotiable rules

1. Add-ons install into `~/.GoatCitadel/addons/<addonId>`, never into the GoatCitadel app checkout.
2. No add-on may install silently.
3. Every add-on install must show:
   - source repository URL
   - declared owner
   - whether GoatCitadel considers it the same owner as the core app
   - trust tier
   - install location
4. User confirmation is required before clone/download.
5. Add-ons may be stopped, updated, or uninstalled independently of GoatCitadel.

## Trust tiers

- `trusted`: built-in or first-party add-on with a reviewed install/runtime path.
- `restricted`: optional code download allowed only after explicit user consent and visible provenance.
- `quarantined`: discovered but not installable without further review.

## Same-owner metadata

Some add-ons may be marked `sameOwnerAsGoatCitadel: true` in the catalog. This is catalog metadata, not a cryptographic proof. If local repo metadata or remotes are unavailable, GoatCitadel must not pretend ownership was verified automatically.

## Runtime isolation expectations

1. Add-ons run as separate processes.
2. Add-on health checks are explicit and visible.
3. Add-ons must not be treated as trusted just because they launch successfully.
4. If an add-on exposes a web UI later, GoatCitadel may proxy or embed it only after the add-on publishes a stable health and entry contract.

## Operator guidance

Before enabling an add-on, review:
- repo URL
- owner
- install/build/start commands
- network behavior
- health check behavior
- what data, if any, the add-on reads from GoatCitadel
