import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TOTP_VALIDATE_SCRIPT =
  "/opt/openclaw/.openclaw/workspace/scripts/secrets-totp-validate";

export interface TotpValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a TOTP code against the openclaw-secrets keychain entry.
 * Shells out to the Python validator script running as the openclaw user.
 * MUST NOT be called with sudo or as any other user.
 *
 * @param code - 6-digit TOTP code
 * @returns { valid: boolean }
 */
export async function validateTotp(
  code: string
): Promise<TotpValidationResult> {
  // Input validation — do not pass unsanitized code to execFile
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, error: "TOTP code must be exactly 6 digits" };
  }

  try {
    await execFileAsync(TOTP_VALIDATE_SCRIPT, [code], {
      timeout: 5000,
      env: { PATH: "/usr/bin:/bin" }, // Minimal env — script only needs `security`
    });
    // Exit code 0 = valid
    return { valid: true };
  } catch (err: unknown) {
    // Non-zero exit = invalid or error
    const e = err as NodeJS.ErrnoException & { code?: number | string };
    // execFile reports process exit codes as e.code when it's a number
    const exitCode = typeof e.code === "number" ? e.code : undefined;
    if (exitCode === 1) {
      return { valid: false };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `TOTP validation error: ${msg}` };
  }
}
