export type Tier = "open" | "controlled" | "restricted";

export interface RegistryEntry {
  name: string;
  tier: Tier;
}

export interface PluginConfig {
  registryPath: string;         // default: "/opt/openclaw/.openclaw/workspace/scripts/secrets.registry"
  grantsDir: string;            // default: "/opt/openclaw/.openclaw/grants"
  brokerBin: string;            // default: "/usr/local/libexec/openclaw/secrets-broker"
  secretsBin: string;           // default: "/opt/openclaw/.openclaw/workspace/scripts/secrets"
  grantTtlSlackMs: number;      // default: 5000
  grantDefaultTtlSeconds: number; // default: 300 (5 min)
  allowedCommands: string[];    // default: [] — whitelist of broker command aliases
}

// ─── New tool param/result types ─────────────────────────────────────────────

export interface SecretsGrantParams {
  name: string;
  code: string;
  ttlSeconds?: number;
}

export interface SecretsGrantResult {
  granted: boolean;
  name: string;
  expiresAt: string;
  expiresInSeconds: number;
  error?: string;
}

export interface SecretsElevateParams {
  code: string;
}

export interface SecretsElevateResult {
  elevated: boolean;
  expiresAt?: string;
  expiresInSeconds?: number;
  windowMinutes?: number;
  error?: string;
}

export interface SecretsInvokeParams {
  name: string;
  command: string;
  args?: string[];
}

export interface SecretsInvokeResult {
  success: boolean;
  exitCode: number;
  name: string;
  command: string;
}

export interface GrantInfo {
  granted: boolean;
  expiresAt: Date | null;
  expiresInMs: number | null;
}
