/**
 * openclaw-secrets-plugin
 *
 * Tiered, TOTP-gated, agent-blind secrets access for OpenClaw.
 *
 * Tiers:
 *   open       — value returned directly
 *   controlled — requires a time-limited grant (TOTP-approved by human)
 *   restricted — agent-blind: metadata only, value NEVER flows to agent
 */

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type {
  OpenClawPluginApi,
  AnyAgentTool,
} from "/opt/openclaw/projects/openclaw/dist/plugin-sdk/plugin-sdk/index.js";
import type { OpenClawPluginDefinition } from "/opt/openclaw/projects/openclaw/dist/plugin-sdk/plugins/types.js";
import { resolveConfig } from "./config.js";
import { loadRegistry, findEntry } from "./registry.js";
import { readGrant } from "./grants.js";
import { fetchFromKeychain } from "./keychain.js";
import type { PluginConfig, RegistryEntry, GrantInfo } from "./types.js";

// ─── Schema Definitions ──────────────────────────────────────────────────────

const SecretsGetParams = Type.Object({
  name: Type.String({ description: "Name of the secret to retrieve" }),
});

const SecretsListParams = Type.Object({});

const SecretsStatusParams = Type.Object({
  name: Type.String({ description: "Name of the secret to check grant status for" }),
});

type SecretsGetParams = Static<typeof SecretsGetParams>;
type SecretsListParams = Static<typeof SecretsListParams>;
type SecretsStatusParams = Static<typeof SecretsStatusParams>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGrantInfo(grantInfo: GrantInfo): string {
  if (!grantInfo.granted) return "not granted";
  const ms = grantInfo.expiresInMs ?? 0;
  const sec = Math.round(ms / 1000);
  return `granted (expires in ${sec}s)`;
}

function restrictedMetadata(name: string, grantInfo: GrantInfo): string {
  return JSON.stringify({
    name,
    tier: "restricted",
    agentBlind: true,
    note: "Restricted secrets are never accessible to agents. Value is intentionally withheld.",
    grantStatus: formatGrantInfo(grantInfo),
  });
}

// ─── Tool Factories ───────────────────────────────────────────────────────────

function createSecretsGetTool(cfg: PluginConfig): AnyAgentTool {
  return {
    name: "secrets_get",
    label: "Get Secret",
    description:
      "Retrieve a secret value by name. Open secrets are returned directly. " +
      "Controlled secrets require an active grant (approved by Sirbam). " +
      "Restricted secrets are agent-blind — metadata only, no value ever returned.",
    parameters: SecretsGetParams,
    ownerOnly: true,
    execute: async (
      _toolCallId: string,
      params: SecretsGetParams
    ) => {
      const { name } = params;

      // Reject names with path traversal characters
      if (!/^[\w\-]+$/.test(name)) {
        return {
          content: [{ type: "text" as const, text: `Invalid secret name format: "${name}".` }],
          details: null,
        };
      }

      const entries = loadRegistry(cfg.registryPath);
      const entry: RegistryEntry | undefined = findEntry(entries, name);

      if (!entry) {
        return {
          content: [{ type: "text" as const, text: `Secret "${name}" not found in registry.` }],
          details: null,
        };
      }

      // ── RESTRICTED: agent-blind, exit before any keychain call ──────────
      if (entry.tier === "restricted") {
        const grantInfo = readGrant(cfg.grantsDir, name, cfg.grantTtlSlackMs);
        // EXIT HERE — no value ever flows to agent
        return {
          content: [{ type: "text" as const, text: restrictedMetadata(name, grantInfo) }],
          details: null,
        };
      }

      // ── CONTROLLED: check grant before fetching ──────────────────────────
      if (entry.tier === "controlled") {
        const grantInfo = readGrant(cfg.grantsDir, name, cfg.grantTtlSlackMs);
        if (!grantInfo.granted) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Access to "${name}" requires approval.\n` +
                  `Ask Sirbam to run: approve ${name} <TOTP_CODE>`,
              },
            ],
            details: null,
          };
        }
        // Grant is valid — fetch value
        try {
          const value = await fetchFromKeychain(cfg.secretsBin, name);
          return {
            content: [{ type: "text" as const, text: value }],
            details: { name, tier: entry.tier, grantStatus: formatGrantInfo(grantInfo) },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Failed to fetch "${name}": ${msg}` }],
            details: null,
          };
        }
      }

      // ── OPEN: fetch directly ─────────────────────────────────────────────
      try {
        const value = await fetchFromKeychain(cfg.secretsBin, name);
        return {
          content: [{ type: "text" as const, text: value }],
          details: { name, tier: entry.tier },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to fetch "${name}": ${msg}` }],
          details: null,
        };
      }
    },
  };
}

function createSecretsListTool(cfg: PluginConfig): AnyAgentTool {
  return {
    name: "secrets_list",
    label: "List Secrets",
    description:
      "List all registered secrets and their tiers. Never returns secret values.",
    parameters: SecretsListParams,
    execute: async (_toolCallId: string, _params: SecretsListParams) => {
      const entries = loadRegistry(cfg.registryPath);
      if (entries.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No secrets registered." }],
          details: [],
        };
      }
      const rows = entries.map((e) => `${e.name} [${e.tier}]`).join("\n");
      return {
        content: [{ type: "text" as const, text: rows }],
        details: entries.map((e) => ({ name: e.name, tier: e.tier })),
      };
    },
  };
}

function createSecretsStatusTool(cfg: PluginConfig): AnyAgentTool {
  return {
    name: "secrets_status",
    label: "Secret Grant Status",
    description:
      "Check the grant status for a secret. Never returns the secret value.",
    parameters: SecretsStatusParams,
    execute: async (_toolCallId: string, params: SecretsStatusParams) => {
      const { name } = params;

      // Reject names with path traversal characters
      if (!/^[\w\-]+$/.test(name)) {
        return {
          content: [{ type: "text" as const, text: `Invalid secret name format: "${name}".` }],
          details: null,
        };
      }

      const entries = loadRegistry(cfg.registryPath);
      const entry = findEntry(entries, name);

      if (!entry) {
        return {
          content: [{ type: "text" as const, text: `Secret "${name}" not found in registry.` }],
          details: null,
        };
      }

      const result: Record<string, unknown> = {
        name,
        tier: entry.tier,
      };

      if (entry.tier === "open") {
        result["grantRequired"] = false;
        result["note"] = "Open secrets do not require a grant.";
      } else {
        const grantInfo = readGrant(cfg.grantsDir, name, cfg.grantTtlSlackMs);
        result["grantRequired"] = true;
        result["granted"] = grantInfo.granted;
        result["grantStatus"] = formatGrantInfo(grantInfo);
        if (grantInfo.expiresAt) {
          result["expiresAt"] = grantInfo.expiresAt.toISOString();
        }
        if (entry.tier === "restricted") {
          result["agentBlind"] = true;
          result["note"] =
            "Restricted secrets are agent-blind — grant status visible but value is never accessible.";
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

// ─── Plugin Definition ────────────────────────────────────────────────────────

const plugin: OpenClawPluginDefinition = {
  id: "openclaw-secrets-plugin",
  name: "OpenClaw Secrets Plugin",
  version: "1.0.0",
  description:
    "Tiered, TOTP-gated, agent-blind secrets access. Tiers: open | controlled | restricted.",

  register(api: OpenClawPluginApi): void {
    const cfg = resolveConfig(api.pluginConfig);

    api.registerTool(createSecretsGetTool(cfg), { optional: true });
    api.registerTool(createSecretsListTool(cfg), { optional: true });
    api.registerTool(createSecretsStatusTool(cfg), { optional: true });

    api.logger.info(
      `[openclaw-secrets-plugin] Registered 3 tools. Registry: ${cfg.registryPath}`
    );
  },
};

export default plugin;
