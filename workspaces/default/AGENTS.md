# Default Workspace Agent Conventions

Overrides global `AGENTS.md` for workspace `default`.

## Workspace Routing

- Use minimal-agent routing unless prompt explicitly asks for multi-role output.
- Preserve role section ordering when multi-role is requested.

## Workspace Quality Rules

- Always include a `Constraints` block if any tool was blocked or failed.
- Do not repeat identical tool failures more than twice.
- Ask for missing required tool arguments instead of guessing.

