# Triggers and Node Selection

## Choosing a trigger

- **Time-based schedule** → Cron or similar schedule trigger.
- **Incoming HTTP request/webhook** → Webhook node (specify URL, method, auth, payload).
- **SaaS app event** (for example "new row") → App-specific trigger node when available.
- **n8n lifecycle/workflow events** → n8n Trigger node (instance start, workflow publish/update).

Clarify:

- What event starts the workflow.
- What data is available at trigger time.
- Reliability and security constraints (webhook exposure, idempotency, etc.).

## Common node patterns

- **Set**: Shape/rename fields, add static values, prepare payloads.
- **HTTP Request**: Call REST APIs when no dedicated node exists or when fine-grained control is needed.
- **If / Switch**: Conditional routing based on item fields.
- **Merge / Split In Batches**: Parallel flows and large lists.
- **Function / Code**: Custom scripts where built-in nodes are insufficient.
- **App nodes**: Prefer when stable integrations exist; encapsulate auth and endpoint details.

## Trigger troubleshooting checklist

1. Confirm the workflow is active/deployed.
2. Verify trigger configuration (Cron expression, webhook URL/method, app subscription).
3. Check network/firewall access for webhook triggers.
4. Use test executions and Executions logs to see if the trigger fires.
5. For n8n Trigger nodes, confirm the event type and workflow match your expectations.
