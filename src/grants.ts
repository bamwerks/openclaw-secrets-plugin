import { readFileSync } from "node:fs";
import path from "node:path";
import type { GrantInfo } from "./types.js";

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
