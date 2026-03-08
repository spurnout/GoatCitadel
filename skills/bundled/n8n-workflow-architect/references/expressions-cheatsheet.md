# n8n Expressions Cheat Sheet

## Basics

- Expressions are written as `{{ ... }}` inside node parameters.
- They use helpers like `$json`, `$item`, `$node`, `$workflow`, and others to access workflow data.

## Common patterns

- Current item field: `{{ $json.userId }}`
- Nested field: `{{ $json.user.profile.email }}`
- Previous node output: `{{ $node["Fetch User"].json.userId }}`
- Previous HTTP status: `{{ $node["API Request"].json.statusCode }}`
- Array element: `{{ $json.items[0].id }}`
- Simple conditional: `{{ $json.total > 0 ? "has_items" : "empty" }}`

## Tips

- Match node names in `$node["..."]` exactly as in the editor.
- When unsure of a path, run a test execution and mirror the output structure.
- Prefer meaningful field names and small explicit transformations.
