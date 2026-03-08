# n8n Expression Snippets

## Reading from trigger payload

- `={{ $json.body.email }}` – Email from webhook payload.
- `={{ $json.query.page }}` – Page number from query string.

## Referencing previous nodes

- `={{ $node["Fetch User"].json.data.id }}` – User ID from a prior HTTP Request.
- `={{ $node["Lookup in DB"].json.rows[0].status }}` – Status from first DB row.

## Building request bodies

- `={{ { id: $json.id, status: "processed" } }}` – Inline object for JSON body.
- `={{ $json.items.map(item => item.id) }}` – Array of IDs from `items`.

## Simple transformations

- `={{ $json.amount * 100 }}` – Convert from dollars to cents.
- `={{ new Date().toISOString() }}` – Current timestamp in ISO format.
