# Default Workspace Runtime Guidance

This file overrides `GOATCITADEL.md` for workspace `default`.

## Workspace Focus

- General-purpose operator workspace.
- Keep responses concise and actionable unless depth is requested.
- Prefer explicit constraints and next steps when tools are blocked.

## Response Shape

Default:

- Answer naturally and directly for ordinary chat, creative prompts, and simple factual questions.
- Use structured sections only when the task is operational, planning-heavy, approval-heavy, risk-heavy, or explicitly asks for structure.
- When structure helps, prefer:
  1. Summary
  2. Actions
  3. Risks
  4. Questions
