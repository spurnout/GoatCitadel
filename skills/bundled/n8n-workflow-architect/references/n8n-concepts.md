# Core n8n Concepts

## Platform overview

- n8n is a workflow automation platform that connects services and APIs so users can build automations with minimal code.
- Workflows are made of nodes wired together; each node receives items, processes them, and passes items onward.
- Items typically contain JSON data and optional binary data; most nodes read from `$json` and write updated fields.

## Workflows and executions

- A workflow becomes active when deployed or published; triggers define when executions start.
- Each workflow run is an execution; executions can be inspected in the UI to view node inputs/outputs and debug issues.

## Node types

- **Trigger nodes** start workflows (Cron, Webhook, app triggers, and the n8n Trigger node for lifecycle events).
- **Core functional nodes** (Set, If, Switch, Merge, Split In Batches, HTTP Request, Function/Code) implement logic and data movement.
- **App nodes** integrate specific SaaS APIs; when none exists, use HTTP Request or Function/Code.

## Data and expressions

- Data flows as items, each with a JSON object; nested structures and arrays are common.
- Expressions (`{{ ... }}`) use helpers like `$json`, `$item`, `$node`, and `$workflow` to access and transform workflow data.

Use this when you need a succinct explanation of n8n’s model or to align terminology with the user.
