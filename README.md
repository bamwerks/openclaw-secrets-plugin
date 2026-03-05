# openclaw-secrets-plugin

A standalone OpenClaw plugin providing tiered, TOTP-gated, agent-blind secrets access.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) ![OpenClaw compatible](https://img.shields.io/badge/OpenClaw-compatible-blue.svg)

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
- **controlled**: Returns value if a valid grant exists; otherwise asks the human operator to run `approve <name> <TOTP_CODE>` in the OpenClaw interface
- **restricted**: Returns metadata only — value is never fetched

### `secrets_list`
List all registered secrets and their tiers. Never returns values.

### `secrets_status`
Check grant status for a specific secret. Never returns values.

---

## Quick Start

### Prerequisites

- macOS (plugin uses macOS Keychain for credential storage)
- Node.js 18+
- OpenClaw installed (see recommended setup below)

### Recommended OpenClaw Setup

If you haven't already, install OpenClaw to the recommended system path:

```bash
# Create the openclaw system directory
sudo mkdir -p /opt/openclaw/projects

# Install OpenClaw globally
npm install -g openclaw

# Initialize OpenClaw at /opt/openclaw
HOME=/opt/openclaw openclaw init
```

> **Why `/opt/openclaw`?** Keeping OpenClaw at a dedicated system path (separate from your user home) isolates agent credentials, workspace files, and plugins from your personal environment. It also makes the setup reproducible.

### Install the Plugin

Clone the plugin into your projects folder:

```bash
git clone https://github.com/bamwerks/openclaw-secrets-plugin /opt/openclaw/projects/openclaw-secrets-plugin
cd /opt/openclaw/projects/openclaw-secrets-plugin
npm install
```

### Configure openclaw.json

Add to your OpenClaw config at `/opt/openclaw/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["/opt/openclaw/projects/openclaw-secrets-plugin"]
    }
  }
}
```

To expose the tools to your agents:

```json
{
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

### Set Up the Registry

```bash
cp /opt/openclaw/projects/openclaw-secrets-plugin/config/secrets.registry.example \
   /opt/openclaw/.openclaw/workspace/scripts/secrets.registry
```

Edit `secrets.registry` to define your secrets (see [Registry Format](#registry-format) below).

### Verify Installation

```bash
openclaw doctor
openclaw secrets list
```

If `secrets_list` appears in the tool list, the plugin is active.

---

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
   { "plugins": { "load": { "paths": ["/opt/openclaw/projects/openclaw-secrets-plugin"] } } }
   ```
5. **Run `openclaw doctor`** after installing to catch manifest/config issues before restarting

These requirements are NOT documented in the OpenClaw plugin docs as of 2026.3.2.


## See Also

[openclaw-starter](https://github.com/bamwerks/openclaw-starter) — production pipeline patterns that use this plugin, including memory architecture, swarm templates, and macOS service setup.

## License

MIT
