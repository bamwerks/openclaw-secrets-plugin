# openclaw-secrets-plugin

A standalone OpenClaw plugin providing tiered, TOTP-gated, agent-blind secrets access.

## Overview

Three tiers of secrets:

| Tier | Agent Access | Grant Required | Description |
|------|-------------|----------------|-------------|
| `open` | Value returned | No | Low-sensitivity credentials |
| `controlled` | Value returned when granted | Yes (TOTP-approved) | Medium-sensitivity, time-limited access |
| `restricted` | Metadata ONLY — agent-blind | N/A | High-sensitivity — value never flows to agent |

## Tools

### `secrets_get`
Retrieve a secret by name. Behavior depends on tier:
- **open**: Returns value directly
- **controlled**: Returns value if a valid grant exists; otherwise asks Sirbam to `approve <name> <TOTP_CODE>`
- **restricted**: Returns metadata only — value is never fetched

### `secrets_list`
List all registered secrets and their tiers. Never returns values.

### `secrets_status`
Check grant status for a specific secret. Never returns values.

## Installation

### 1. Install dependencies

```bash
cd /opt/openclaw/projects/openclaw-secrets-plugin
npm install
```

### 2. Configure `openclaw.json`

Add the following to your `openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["/opt/openclaw/projects/openclaw-secrets-plugin/src/index.ts"]
    }
  },
  "agents": {
    "list": [{
      "id": "main",
      "tools": {
        "allow": ["secrets_get", "secrets_list", "secrets_status"]
      }
    }]
  }
}
```

### 3. Configure the registry

Copy the example registry to the default location:

```bash
cp config/secrets.registry.example /opt/openclaw/.openclaw/workspace/scripts/secrets.registry
```

Edit it to match your secrets.

## Plugin Configuration

All config values are optional (defaults shown):

```json
{
  "plugins": {
    "config": {
      "openclaw-secrets-plugin": {
        "registryPath": "/opt/openclaw/.openclaw/workspace/scripts/secrets.registry",
        "grantsDir": "/opt/openclaw/.openclaw/grants",
        "brokerBin": "/usr/local/libexec/openclaw/secrets-broker",
        "secretsBin": "/opt/openclaw/.openclaw/workspace/scripts/secrets",
        "grantTtlSlackMs": 5000
      }
    }
  }
}
```

## Registry Format

```
# name|tier  (tier: open | controlled | restricted)
bamwerks_app_id|open
cloudflare_api_token|controlled
oauth_client_secret|restricted
```

## Grant File Format

Grant files live at `<grantsDir>/<name>.grant`. Content is either:
- Unix timestamp in seconds: `1772495154`
- ISO8601 string: `2026-01-01T00:00:00Z`

A grant is valid if the timestamp is in the future (with a configurable slack of `grantTtlSlackMs`).

## Security Design

- **Restricted** secrets exit before any keychain call — the value never reaches the agent context
- **Controlled** secrets require a human-approved grant (time-limited, TOTP-protected)
- **Open** secrets are accessible without approval (low-sensitivity app IDs, non-secret public identifiers)
- The `broker.ts` module is included for structural completeness but is **never called by tools**

## Development

```bash
# Type check
npm run typecheck

# Run tests
npm test
```

## OpenClaw Plugin Discovery Requirements

> **Lesson learned from initial deployment — required for any OpenClaw plugin:**

1. **`openclaw.plugin.json` must be at the project root** (not in `src/`)
2. **Root barrel file required** — `index.ts` at root re-exporting from `./src/index.js`
3. **Manifest `entry` must be `./index.ts`** (root), not `./src/index.ts`
4. **`plugins.load.paths` must point to the directory**, not a file:
   ```json
   { "plugins": { "load": { "paths": ["/path/to/openclaw-secrets-plugin"] } } }
   ```
5. **Run `openclaw doctor`** after installing to catch manifest/config issues before restarting

These requirements are NOT documented in the OpenClaw plugin docs as of 2026.3.2.
