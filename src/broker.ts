/**
 * broker.ts — Broker proxy for restricted secret invocation.
 *
 * The secrets-broker binary runs as sirbam (sudoers: NOPASSWD).
 * It reads the secret from bamwerks.keychain-db and executes the
 * requested command with the secret injected — the value NEVER
 * returns to the agent.
 *
 * Command injection mitigation:
 * - All inputs validated against strict regexes before any subprocess call.
 * - execFile (never exec/shell) — no shell metacharacter expansion.
 * - command is a whitelist alias, not a free-form string.
 * - args are individually validated, no shell quoting needed.
 * - sudo called with -n (non-interactive) and explicit arg list.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const BROKER_BIN = "/usr/local/libexec/openclaw/secrets-broker";
export const SUDO_BIN = "/usr/bin/sudo";

/** Regex for allowed arg characters — no shell metacharacters */
const SAFE_ARG_RE = /^[\w\-\.\/=:@]+$/;

export interface BrokerInvokeResult {
  success: boolean;
  exitCode: number;
}

/**
 * Invoke the secrets-broker for a restricted secret operation.
 * The secret value NEVER appears in the return value.
 *
 * @param brokerBin   - Path to secrets-broker binary
 * @param name        - Secret name (pre-validated ^[\w\-]+$)
 * @param command     - Whitelisted command alias (pre-validated ^[\w\-]+$)
 * @param args        - Additional arguments (each validated against SAFE_ARG_RE)
 * @param allowedCmds - Set of allowed command aliases from config
 */
export async function invokeBroker(
  brokerBin: string,
  name: string,
  command: string,
  args: string[],
  allowedCmds: Set<string>
): Promise<BrokerInvokeResult> {
  // Validate name
  if (!/^[\w\-]+$/.test(name)) {
    throw new Error(`Invalid name: "${name}"`);
  }

  // Validate command — must be in whitelist
  if (!/^[\w\-]+$/.test(command)) {
    throw new Error(`Invalid command format: "${command}"`);
  }
  if (!allowedCmds.has(command)) {
    throw new Error(`Command "${command}" is not in the allowedCommands whitelist`);
  }

  // Validate each arg individually
  for (const arg of args) {
    if (!SAFE_ARG_RE.test(arg)) {
      throw new Error(`Argument contains disallowed characters: "${arg}"`);
    }
  }

  // Build argv — no shell involved
  // sudo -n -u sirbam <brokerBin> <name> <command> [args...]
  const argv = ["-n", "-u", "sirbam", brokerBin, name, command, ...args];

  try {
    await execFileAsync(SUDO_BIN, argv, {
      timeout: 15000,
      maxBuffer: 1024 * 1024, // 1MB
      env: {
        PATH: "/usr/bin:/bin:/usr/local/bin",
        HOME: "/opt/openclaw",
      },
    });

    return {
      success: true,
      exitCode: 0,
    };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      code?: number | string;
    };
    const exitCode = typeof e.code === "number" ? e.code : 1;
    return {
      success: false,
      exitCode,
    };
  }
}
