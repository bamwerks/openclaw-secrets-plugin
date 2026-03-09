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
import { readGrant, writeGrant } from "./grants.js";
import { fetchFromKeychain } from "./keychain.js";
import { validateTotp } from "./totp.js";
import { invokeBroker } from "./broker.js";
import type { PluginConfig, RegistryEntry, GrantInfo } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ELEVATE_TTL_SECONDS = 1800; // 30 minutes — hardcoded, not configurable

// ─── Schema Definitions ──────────────────────────────────────────────────────

const SecretsGetParams = Type.Object({
  name: Type.String({ description: "Name of the secret to retrieve" }),
});

const SecretsListParams = Type.Object({});

const SecretsStatusParams = Type.Object({
  name: Type.String({ description: "Name of the secret to check grant status for" }),
});

const SecretsGrantParams = Type.Object({
  name: Type.String({ description: "Secret name to grant access for" }),
  code: Type.String({ description: "6-digit TOTP code" }),
  ttlSeconds: Type.Optional(
    Type.Number({ description: "Grant TTL in seconds (default: config.grantDefaultTtlSeconds)" })
  ),
});

const SecretsElevateParams = Type.Object({
  code: Type.String({ description: "6-digit TOTP code" }),
});

const SecretsInvokeParams = Type.Object({
  name: Type.String({ description: "Restricted secret name" }),
  command: Type.String({ description: "Whitelisted command alias" }),
  args: Type.Optional(Type.Array(Type.String(), { description: "Additional arguments" })),
});

type SecretsGetParams = Static<typeof SecretsGetParams>;
type SecretsListParams = Static<typeof SecretsListParams>;
type SecretsStatusParams = Static<typeof SecretsStatusParams>;
type SecretsGrantSchemaParams = Static<typeof SecretsGrantParams>;
type SecretsElevateSchemaParams = Static<typeof SecretsElevateParams>;
type SecretsInvokeSchemaParams = Static<typeof SecretsInvokeParams>;

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

function createSecretsGrantTool(cfg: PluginConfig): AnyAgentTool {
  return {
    name: "secrets_grant",
    label: "Grant Secret Access",
    description:
      "Validate a TOTP code and write a time-limited grant for a controlled or restricted secret.",
    parameters: SecretsGrantParams,
    ownerOnly: true,
    execute: async (_toolCallId: string, params: SecretsGrantSchemaParams) => {
      const { name, code, ttlSeconds } = params;

      if (!/^[\w\-]+$/.test(name)) {
        return {
          content: [{ type: "text" as const, text: `Invalid secret name format: "${name}".` }],
          details: { granted: false },
        };
      }
      if (!/^\d{6}$/.test(code)) {
        return {
          content: [{ type: "text" as const, text: "Invalid TOTP code format. Must be 6 digits." }],
          details: { granted: false },
        };
      }

      const entries = loadRegistry(cfg.registryPath);
      const entry: RegistryEntry | undefined = findEntry(entries, name);

      if (!entry) {
        return {
          content: [{ type: "text" as const, text: `Secret "${name}" not found in registry.` }],
          details: { granted: false },
        };
      }
      if (entry.tier === "open") {
        return {
          content: [{ type: "text" as const, text: `Open secrets do not require a grant.` }],
          details: { granted: false },
        };
      }

      const validation = await validateTotp(code);
      if (!validation.valid) {
        return {
          content: [{ type: "text" as const, text: `Invalid TOTP code.` }],
          details: { granted: false, error: "Invalid TOTP code" },
        };
      }

      const ttl = ttlSeconds ?? cfg.grantDefaultTtlSeconds;
      try {
        const result = writeGrant(cfg.grantsDir, name, ttl);
        return {
          content: [{
            type: "text" as const,
            text: `Grant written for "${name}". Expires ${result.expiresAt.toISOString()} (${ttl}s).`,
          }],
          details: {
            granted: true,
            name,
            expiresAt: result.expiresAt.toISOString(),
            expiresInSeconds: result.expiresInSeconds,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to write grant: ${msg}` }],
          details: { granted: false },
        };
      }
    },
  };
}

function createSecretsElevateTool(cfg: PluginConfig): AnyAgentTool {
  return {
    name: "secrets_elevate",
    label: "Elevate Gateway Access",
    description:
      "Validates a TOTP code and writes a 30-minute elevate grant, enabling " +
      "privileged operations (e.g., gateway restart). Requires owner approval.",
    parameters: SecretsElevateParams,
    ownerOnly: true,
    execute: async (_toolCallId: string, params: SecretsElevateSchemaParams) => {
      const { code } = params;

      const validation = await validateTotp(code);
      if (!validation.valid) {
        return {
          content: [{ type: "text" as const, text: "Invalid TOTP code. Elevation denied." }],
          details: { elevated: false, error: "Invalid TOTP code" },
        };
      }

      try {
        const result = writeGrant(cfg.grantsDir, "elevate", ELEVATE_TTL_SECONDS);
        return {
          content: [{
            type: "text" as const,
            text: `Elevated. Gateway operations enabled for 30 minutes (expires ${result.expiresAt.toISOString()}).`,
          }],
          details: {
            elevated: true,
            expiresAt: result.expiresAt.toISOString(),
            expiresInSeconds: result.expiresInSeconds,
            windowMinutes: 30,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to write elevate grant: ${msg}` }],
          details: { elevated: false },
        };
      }
    },
  };
}

function createSecretsInvokeTool(cfg: PluginConfig): AnyAgentTool {
  return {
    name: "secrets_invoke",
    label: "Invoke via Secrets Broker",
    description:
      "Proxy a whitelisted command through the secrets-broker for a restricted secret. " +
      "The secret value never enters agent context.",
    parameters: SecretsInvokeParams,
    ownerOnly: true,
    execute: async (_toolCallId: string, params: SecretsInvokeSchemaParams) => {
      const { name, command, args = [] } = params;

      if (!/^[\w\-]+$/.test(name)) {
        return {
          content: [{ type: "text" as const, text: `Invalid secret name format: "${name}".` }],
          details: { success: false, exitCode: 1, name, command },
        };
      }
      if (!/^[\w\-]+$/.test(command)) {
        return {
          content: [{ type: "text" as const, text: `Invalid command format: "${command}".` }],
          details: { success: false, exitCode: 1, name, command },
        };
      }

      // Validate each arg
      const SAFE_ARG_RE = /^[\w\-\.\/=:@]+$/;
      for (const arg of args) {
        if (!SAFE_ARG_RE.test(arg)) {
          return {
            content: [{
              type: "text" as const,
              text: `Argument contains disallowed characters: "${arg}".`,
            }],
            details: { success: false, exitCode: 1, name, command },
          };
        }
      }

      const entries = loadRegistry(cfg.registryPath);
      const entry: RegistryEntry | undefined = findEntry(entries, name);

      if (!entry || entry.tier !== "restricted") {
        return {
          content: [{
            type: "text" as const,
            text: `"${name}" is not a restricted secret or does not exist.`,
          }],
          details: { success: false, exitCode: 1, name, command },
        };
      }

      const allowedCmds = new Set(cfg.allowedCommands);
      if (!allowedCmds.has(command)) {
        return {
          content: [{
            type: "text" as const,
            text: `Command "${command}" is not in the allowedCommands whitelist.`,
          }],
          details: { success: false, exitCode: 1, name, command },
        };
      }

      // Belt-and-suspenders: check active grant
      const grantInfo = readGrant(cfg.grantsDir, name, cfg.grantTtlSlackMs);
      if (!grantInfo.granted) {
        return {
          content: [{
            type: "text" as const,
            text: `No active grant for "${name}". Use secrets_grant first.`,
          }],
          details: { success: false, exitCode: 1, name, command },
        };
      }

      try {
        const result = await invokeBroker(cfg.brokerBin, name, command, args, allowedCmds);
        return {
          content: [{
            type: "text" as const,
            text: result.success
              ? `Broker invocation succeeded.`
              : `Broker invocation failed (exit ${result.exitCode}).`,
          }],
          details: {
            success: result.success,
            exitCode: result.exitCode,
            name,
            command,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Broker error: ${msg}` }],
          details: { success: false, exitCode: 1, name, command },
        };
      }
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
    api.registerTool(createSecretsGrantTool(cfg), { optional: true });
    api.registerTool(createSecretsElevateTool(cfg), { optional: true });
    api.registerTool(createSecretsInvokeTool(cfg), { optional: true });

    if (cfg.allowedCommands.length === 0) {
      api.logger.warn(
        `[openclaw-secrets-plugin] allowedCommands is empty — secrets_invoke will always reject commands.`
      );
    }

    api.logger.info(
      `[openclaw-secrets-plugin] Registered 6 tools. Registry: ${cfg.registryPath}`
    );
  },
};

export default plugin;
