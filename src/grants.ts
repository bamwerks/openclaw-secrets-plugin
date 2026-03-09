import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { GrantInfo } from "./types.js";

export interface WriteGrantResult {
  grantPath: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

/**
 * Write a grant file. Content is a Unix timestamp (seconds) representing expiry.
 * grantsDir is owned by openclaw — no sudo required.
 *
 * @param grantsDir  - /opt/openclaw/.openclaw/grants
 * @param name       - Grant name (pre-validated, alphanumeric+dash only)
 * @param ttlSeconds - Time-to-live in seconds
 */
export function writeGrant(
  grantsDir: string,
  name: string,
  ttlSeconds: number
): WriteGrantResult {
  // name must be validated upstream — assert the invariant
  if (!/^[\w\-]+$/.test(name)) {
    throw new Error(`Invalid grant name: "${name}"`);
  }
  if (ttlSeconds <= 0 || ttlSeconds > 86400) {
    throw new Error(`Invalid TTL: ${ttlSeconds}s (must be 1–86400)`);
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const unixTs = Math.floor(expiresAt.getTime() / 1000).toString();
  const grantPath = path.join(grantsDir, `${name}.grant`);

  // mode 0o600 — only openclaw can read/write
  writeFileSync(grantPath, unixTs, { encoding: "utf8", mode: 0o600 });

  return {
    grantPath,
    expiresAt,
    expiresInSeconds: ttlSeconds,
  };
}

/**
 * Revoke a grant by deleting the grant file.
 * Returns true if deleted, false if it didn't exist.
 */
export function revokeGrant(grantsDir: string, name: string): boolean {
  if (!/^[\w\-]+$/.test(name)) {
    throw new Error(`Invalid grant name: "${name}"`);
  }
  const grantPath = path.join(grantsDir, `${name}.grant`);
  try {
    unlinkSync(grantPath);
    return true;
  } catch {
    return false;
  }
}

export function parseGrantExpiry(content: string): Date | null {
  const raw = content.trim();
  if (!raw) return null;

  // Try Unix timestamp (seconds) — pure numeric strings only
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (numeric > 0) {
      return new Date(numeric * 1000);
    }
    return null;
  }

  // Try ISO8601
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

export function readGrant(grantsDir: string, name: string, slackMs = 5000): GrantInfo {
  const grantPath = path.join(grantsDir, `${name}.grant`);
  let content: string;
  try {
    content = readFileSync(grantPath, "utf8");
  } catch {
    return { granted: false, expiresAt: null, expiresInMs: null };
  }

  const expiresAt = parseGrantExpiry(content);
  if (!expiresAt) {
    return { granted: false, expiresAt: null, expiresInMs: null };
  }

  const now = Date.now();
  const expiresMs = expiresAt.getTime();
  const expiresInMs = expiresMs - now;
  const granted = expiresMs + slackMs > now;

  return {
    granted,
    expiresAt,
    expiresInMs: Math.max(0, expiresInMs),
  };
}
