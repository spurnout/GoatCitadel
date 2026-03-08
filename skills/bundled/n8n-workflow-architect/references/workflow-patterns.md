# Reusable n8n Workflow Patterns

## 1. Webhook → Transform → API → Notify

Use for: Ingest external events, normalize data, call an API, then notify.

1. **Webhook** – Receive external POST.
2. **Set** – Normalize/rename fields and add metadata.
3. **If / Switch** – Branch on event type or flags.
4. **HTTP Request / app node** – Call downstream API.
5. **Set** – Prepare human-readable summary.
6. **Notification node** – Send status update.

## 2. Scheduled sync between systems

Use for: Periodic synchronization (for example pull from System A, push to System B).

1. **Cron** – Schedule (for example every N minutes, hourly, daily).
2. **App/API node** – Fetch new/changed records from System A.
3. **Split In Batches** – Chunk large lists.
4. **Set / Function** – Map to target format.
5. **App/API node** – Upsert into System B.
6. **Notification/logging** – Record summary.

## 3. Error handling companion workflow

Use for: Centralized alerting and remediation.

1. Configure main workflows to send errors (Error Trigger or explicit error branches).
2. **Error-handling workflow** with error trigger.
3. **Set** – Format error context (workflow ID, node, message, sample input).
4. **Notification node** – Send to on-call channel.
