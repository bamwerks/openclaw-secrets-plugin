import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGrantExpiry, readGrant } from "../src/grants.js";

describe("parseGrantExpiry", () => {
  it("parses Unix timestamp in seconds", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const result = parseGrantExpiry(String(future));
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeCloseTo(future * 1000, -3);
  });

  it("parses ISO8601 string", () => {
    const iso = "2099-12-31T23:59:59.000Z";
    const result = parseGrantExpiry(iso);
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe(iso);
  });

  it("returns null for empty string", () => {
    expect(parseGrantExpiry("")).toBeNull();
    expect(parseGrantExpiry("   ")).toBeNull();
  });

  it("returns null for invalid content", () => {
    expect(parseGrantExpiry("not-a-date")).toBeNull();
    expect(parseGrantExpiry("abc123")).toBeNull();
  });

  it("returns null for zero timestamp", () => {
    expect(parseGrantExpiry("0")).toBeNull();
  });
});

describe("readGrant (using temp files)", () => {
  const tmpDir = join(tmpdir(), `grants-test-${Date.now()}`);

  it("returns not granted when file is missing", () => {
    mkdirSync(tmpDir, { recursive: true });
    const result = readGrant(tmpDir, "nonexistent_secret");
    expect(result.granted).toBe(false);
    expect(result.expiresAt).toBeNull();
  });

  it("returns granted when file has future Unix timestamp", () => {
    mkdirSync(tmpDir, { recursive: true });
    const future = Math.floor(Date.now() / 1000) + 3600;
    writeFileSync(join(tmpDir, "future_secret.grant"), String(future));
    const result = readGrant(tmpDir, "future_secret");
    expect(result.granted).toBe(true);
    expect(result.expiresAt).not.toBeNull();
    expect(result.expiresInMs).toBeGreaterThan(0);
    rmSync(join(tmpDir, "future_secret.grant"));
  });

  it("returns not granted when file has past Unix timestamp", () => {
    mkdirSync(tmpDir, { recursive: true });
    const past = Math.floor(Date.now() / 1000) - 3600;
    writeFileSync(join(tmpDir, "past_secret.grant"), String(past));
    const result = readGrant(tmpDir, "past_secret", 0);
    expect(result.granted).toBe(false);
    rmSync(join(tmpDir, "past_secret.grant"));
  });

  it("returns granted when file has future ISO8601 timestamp", () => {
    mkdirSync(tmpDir, { recursive: true });
    const iso = "2099-12-31T23:59:59.000Z";
    writeFileSync(join(tmpDir, "iso_secret.grant"), iso);
    const result = readGrant(tmpDir, "iso_secret");
    expect(result.granted).toBe(true);
    rmSync(join(tmpDir, "iso_secret.grant"));
  });

  it("returns not granted when file content is invalid", () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, "bad_secret.grant"), "not-a-timestamp");
    const result = readGrant(tmpDir, "bad_secret");
    expect(result.granted).toBe(false);
    expect(result.expiresAt).toBeNull();
    rmSync(join(tmpDir, "bad_secret.grant"));
  });
});
