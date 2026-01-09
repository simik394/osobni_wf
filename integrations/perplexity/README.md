# Perplexity Integration

This integration provides a webhook to track Perplexity searches in FalkorDB.

## Webhook

The webhook is handled by the `webhook_handler.sh` script. It expects a JSON payload with the following format:

```json
{
  "query": "Your search query",
  "citations": [
    "https://citation.url/1",
    "https://citation.url/2"
  ]
}
```

### Prerequisites

This script requires `jq` to be installed. You can install it using your system's package manager (e.g., `sudo apt-get install jq` or `brew install jq`).

### Usage

You can call the webhook by piping a JSON payload to the script:

```bash
echo '{"query": "falkordb", "citations": ["https://falkordb.com"]}' | ./integrations/perplexity/webhook_handler.sh
```

### Configuration

The FalkorDB connection details can be configured using the following environment variables:

- `FALKORDB_HOST`: The FalkorDB host (default: `localhost`)
- `FALKORDB_PORT`: The FalkorDB port (default: `6379`)
