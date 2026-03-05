# Skill: Bankr Optional Integration (User-Managed)

Use this skill only if you explicitly need Bankr workflows.

This skill is intentionally optional and should stay disabled or sleep-mode until reviewed.

## Safety defaults

1. Default to read-only behavior unless the user clearly asks for a write action.
2. Require explicit approval before any money-moving action.
3. Enforce strict per-action and daily spend caps.
4. Reject unsupported chains, symbols, or action types.
5. Log every attempted action with policy reason and outcome.

## Required operator checks

Before enabling this skill:

1. Network allowlist includes only required Bankr hosts.
2. Tool grants are scoped minimally (task or agent scope preferred).
3. Approval flows are enabled and tested.
4. Dry-run behavior is verified on a non-production wallet/context.

## Suggested action policy

- Allowed action types:
  - `read` by default
  - enable write types (`trade`, `transfer`, `sign`, `submit`, `deploy`) only after review
- Blocklist symbols by default for anything high-risk or unknown.
- Keep write approvals mandatory for every write action.

## Example prompts

- Read-only:
  - "Check balance and recent market movement for ETH on Base."
- Guarded write request:
  - "Prepare a preview to swap 25 USDC to ETH on Base. Do not execute without explicit approval."

## Failure behavior

If a request violates policy:

1. Return a clear blocked reason.
2. Show which policy rule blocked the action.
3. Suggest the next safe action (for example, preview or read-only alternative).

## Notes

- Built-in Bankr is disabled by default in GoatCitadel (`bankrBuiltinEnabled: false`).
- Keep this skill user-managed and explicitly enabled only when needed.
