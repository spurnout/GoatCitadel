# Obsidian Optional Integration

GoatCitadel can optionally read and append markdown notes in a local Obsidian vault.

This integration is:

- optional
- disabled by default
- local filesystem only (no Obsidian plugin required)

If you do not enable it, runtime behavior is unchanged.

## What It Does

When enabled, GoatCitadel can:

- search notes in approved vault subpaths
- read markdown notes (`.md`)
- append markdown blocks to approved notes
- append a structured request row to your Inbox note

## Default Safety Posture

Default config:

- `enabled: false`
- `mode: read_append`
- `allowedSubpaths`:
  - `GoatCitadel`
  - `GoatCitadel/Inbox`
  - `GoatCitadel/Coordination`
  - `GoatCitadel/Tasks`
  - `GoatCitadel/Decisions`

Hard rules:

- path traversal is blocked
- note operations are constrained to vault root + allowed subpaths
- only markdown files are readable/writable
- `read_only` mode blocks append operations

## Mission Control Setup

Open `Connections (Integrations)` and use the Obsidian card:

1. Enable integration.
2. Set `Vault path`.
3. Choose mode:
   - `read_append`: read + append
   - `read_only`: read only
4. Set allowed subpaths (comma-separated).
5. Click `Save Obsidian config`.
6. Click `Test connection`.

Optional quick ops:

- search notes
- capture a quick Inbox request

## API Endpoints

- `GET /api/v1/integrations/obsidian/status`
- `PATCH /api/v1/integrations/obsidian/config`
- `POST /api/v1/integrations/obsidian/test`
- `POST /api/v1/integrations/obsidian/search`
- `GET /api/v1/integrations/obsidian/note?path=...`
- `POST /api/v1/integrations/obsidian/append`
- `POST /api/v1/integrations/obsidian/inbox/capture`

## Recommended Vault Structure

If you want a starter structure with placeholders, scaffold one from this repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/scaffold-obsidian-vault.ps1 -TargetPath "F:\AI Obsidian\AI Info" -SystemName "GoatCitadel"
```

Useful flags:

- `-AgentNames "Architect Goat","Coder Goat",...`
- `-DryRun`
- `-Force`

## Troubleshooting

### Vault unreachable

- Verify path exists and is a directory.
- Confirm the service user has filesystem access.
- Run `Test connection` after every path change.

### Write blocked

- Confirm mode is `read_append`.
- Confirm target note is under allowed subpaths.
- Confirm target is `.md`.

### Search returns nothing

- Use a shorter query.
- Confirm notes are within allowed subpaths.
- Confirm notes are markdown and encoded as UTF-8.
