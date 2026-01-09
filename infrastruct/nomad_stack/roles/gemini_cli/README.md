# Gemini CLI Configuration Role

Configures Gemini CLI telemetry to send traces to Langfuse via OTEL.

## What It Does

1. Ensures `~/.gemini/` directory exists
2. Generates base64-encoded Langfuse auth string
3. Merges telemetry config with existing `settings.json` (preserves other settings)

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `langfuse_public_key` | Langfuse public key (pk-lf-...) | Required |
| `langfuse_secret_key` | Langfuse secret key (sk-lf-...) | Required |
| `langfuse_otel_endpoint` | OTEL traces endpoint | `http://halvarm.tail288db.ts.net:3000/api/public/otel/v1/traces` |

## Usage

### Full Deployment
```bash
ansible-playbook -i inventory.yml playbook.yml -l local --tags gemini_cli
```

## Notes

- Runs without sudo (`become: false`)
- Preserves existing Gemini CLI settings (MCP servers, UI preferences, etc.)
- Only updates the `telemetry` block
