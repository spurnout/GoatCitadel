# Optional Bankr Skill (Not Core)

Bankr is no longer a built-in core feature in GoatCitadel.

- Built-in Bankr paths are disabled by default (`bankrBuiltinEnabled: false`).
- Legacy built-in Bankr endpoints now return `410` with migration guidance.
- Existing Bankr data is preserved. This change does not purge data.

## Quick Start

1. Copy the template:
   - `templates/skills/bankr-optional/SKILL.md`
2. Create a local skill folder, for example:
   - `skills/workspace/bankr-optional/SKILL.md`
3. Edit the template with your real workflow, tools, and approval requirements.
4. In Mission Control `Playbook (Skills)`, reload skills.
5. Keep state as `disabled` or `sleep` until policy and grants are reviewed.
6. Enable only after a dry run on non-production funds.

## Required Safety Posture

1. Use explicit approval gates for any write/money-moving action.
2. Keep strict per-action and daily spend caps in your skill logic.
3. Restrict network allowlist to only required hosts.
4. Prefer read-only first (`balances`, `prices`, `research`) before any write action.
5. Record action/audit metadata so operator review is possible.

## Network Allowlist Notes

Only add hosts you actually need:

- `api.bankr.bot`
- `llm.bankr.bot` (only if you explicitly use this gateway)

Never open wildcard outbound access just for one optional skill.

## Legacy Toggle (Not Recommended)

You can temporarily re-enable built-in Bankr for legacy migration only:

- config feature flag: `bankrBuiltinEnabled: true`
- env override: `GOATCITADEL_FEATURE_BANKR_BUILTIN_ENABLED=true`

Use this only for short migration windows, then disable again.

## Troubleshooting

- If you see `bankr_builtin_disabled`, this is expected while built-in is off.
- Check that your optional skill exists and is loaded in `Playbook (Skills)`.
- Confirm required tool grants and network allowlist entries are in place.
