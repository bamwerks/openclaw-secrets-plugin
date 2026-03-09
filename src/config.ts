import type { PluginConfig } from "./types.js";

export const DEFAULT_CONFIG: PluginConfig = {
  registryPath:
    "/opt/openclaw/.openclaw/workspace/scripts/secrets.registry",
  grantsDir: "/opt/openclaw/.openclaw/grants",
  brokerBin: "/usr/local/libexec/openclaw/secrets-broker",
  secretsBin: "/opt/openclaw/.openclaw/workspace/scripts/secrets",
  grantTtlSlackMs: 5000,
  grantDefaultTtlSeconds: 300,
  allowedCommands: [],
};

export function resolveConfig(
  pluginConfig?: Record<string, unknown>
): PluginConfig {
  if (!pluginConfig) return DEFAULT_CONFIG;
  return {
    registryPath:
      typeof pluginConfig["registryPath"] === "string"
        ? pluginConfig["registryPath"]
        : DEFAULT_CONFIG.registryPath,
    grantsDir:
      typeof pluginConfig["grantsDir"] === "string"
        ? pluginConfig["grantsDir"]
        : DEFAULT_CONFIG.grantsDir,
    brokerBin:
      typeof pluginConfig["brokerBin"] === "string"
        ? pluginConfig["brokerBin"]
        : DEFAULT_CONFIG.brokerBin,
    secretsBin:
      typeof pluginConfig["secretsBin"] === "string"
        ? pluginConfig["secretsBin"]
        : DEFAULT_CONFIG.secretsBin,
    grantTtlSlackMs:
      typeof pluginConfig["grantTtlSlackMs"] === "number"
        ? pluginConfig["grantTtlSlackMs"]
        : DEFAULT_CONFIG.grantTtlSlackMs,
    grantDefaultTtlSeconds:
      typeof pluginConfig["grantDefaultTtlSeconds"] === "number"
        ? pluginConfig["grantDefaultTtlSeconds"]
        : DEFAULT_CONFIG.grantDefaultTtlSeconds,
    allowedCommands: Array.isArray(pluginConfig["allowedCommands"])
      ? (pluginConfig["allowedCommands"] as string[]).filter(
          (c): c is string => typeof c === "string"
        )
      : DEFAULT_CONFIG.allowedCommands,
  };
}
