/**
 * broker.ts — wraps the secrets-broker binary.
 *
 * IMPORTANT: This module is provided for structural completeness ONLY.
 * It is NEVER called from any tool handler. The secrets-broker is an
 * out-of-band approval pathway and must not be invoked by agent tools.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface BrokerApproveResult {
  approved: boolean;
  expiresAt: Date;
}

/**
 * Invoke the secrets-broker to approve a controlled secret.
 * Called by the human operator — NOT by agent tools.
 */
export async function brokerApprove(
  brokerBin: string,
  name: string,
  totpCode: string
): Promise<BrokerApproveResult> {
  const { stdout } = await exec(brokerBin, ["approve", name, totpCode], {
    timeout: 10000,
  });
  const parsed = JSON.parse(stdout.trim()) as { expiresAt: string };
  return {
    approved: true,
    expiresAt: new Date(parsed.expiresAt),
  };
}
