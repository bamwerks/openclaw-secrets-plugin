export type Tier = "open" | "controlled" | "restricted";

export interface RegistryEntry {
  name: string;
  tier: Tier;
}

export interface PluginConfig {
  registryPath: string;    // default: "/opt/openclaw/.openclaw/workspace/scripts/secrets.registry"
  grantsDir: string;       // default: "/opt/openclaw/.openclaw/grants"
  brokerBin: string;       // default: "/usr/local/libexec/openclaw/secrets-broker"
  secretsBin: string;      // default: "/opt/openclaw/.openclaw/workspace/scripts/secrets"
  grantTtlSlackMs: number; // default: 5000
}

export interface GrantInfo {
  granted: boolean;
  expiresAt: Date | null;
  expiresInMs: number | null;
}
