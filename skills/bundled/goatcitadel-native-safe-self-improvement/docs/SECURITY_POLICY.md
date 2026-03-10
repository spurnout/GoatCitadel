# Security Policy

This skill is intentionally fenced in.

## Design Goals

- No network
- No hidden exfiltration
- No reads outside the improvement folder
- No direct edits to GoatCitadel core guidance or code
- No automatic promotion
- No secret handling
- No permission expansion

## Allowed Access

Only this subtree:

```text
.goatcitadel/self-improvement/
```

## Forbidden Access

This skill must never read or write:

- `.env`
- secret files
- provider configs
- API keys
- browser cookies or tokens
- email or calendar data
- source code
- tests
- CI/CD files
- Docker, Traefik, Nginx, Cloudflare, or infra configs
- always-loaded prompt files directly

## Safe Behavior Rules

1. Proposals only, never direct edits.
2. Explicit preferences only, never inferred preferences.
3. Compact memory only, details stay in logs.
4. Review gate for every promotion.
5. Stable patterns only, not one-off moments.
6. No self-justification loops. Evidence must point to local logged entries.

## Sensitive Data Rules

Do not store:
- passwords
- tokens
- secrets
- payment details
- health details
- exact location data
- temporary credentials
- private content unless explicitly needed and appropriate to retain

If sensitive data appears during a task, do not log it. Redact it in any learning or error entry.

## Emergency Stop Rule

If a task would require:
- broader file access
- direct code edits
- network calls
- secret handling
- configuration changes

stop using this skill for that part of the task and return control to a more appropriate reviewed workflow.
