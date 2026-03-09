import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeGrant, revokeGrant, parseGrantExpiry, readGrant } from "../src/grants.js";

// Mock fs operations
vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { writeFileSync, readFileSync, unlinkSync } from "node:fs";

const mockWriteFileSync = writeFileSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockUnlinkSync = unlinkSync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseGrantExpiry", () => {
  it("parses unix timestamps", () => {
    const future = Math.floor(Date.now() / 1000) + 300;
    const d = parseGrantExpiry(String(future));
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBeCloseTo(future * 1000, -2);
  });

  it("returns null for empty string", () => {
    expect(parseGrantExpiry("")).toBeNull();
  });

  it("parses ISO8601", () => {
    const iso = new Date(Date.now() + 5000).toISOString();
    expect(parseGrantExpiry(iso)).not.toBeNull();
  });
});

describe("writeGrant", () => {
  it("creates file with correct unix timestamp content", () => {
    const before = Math.floor(Date.now() / 1000);
    writeGrant("/tmp/grants", "my-secret", 300);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const [path, content, opts] = mockWriteFileSync.mock.calls[0] as [string, string, { mode: number }];
    expect(path).toBe("/tmp/grants/my-secret.grant");
    const ts = Number(content);
    expect(ts).toBeGreaterThanOrEqual(before + 300);
    expect(ts).toBeLessThanOrEqual(before + 302);
    expect(opts.mode).toBe(0o600);
  });

  it("throws for invalid name", () => {
    expect(() => writeGrant("/tmp/grants", "../evil", 300)).toThrow("Invalid grant name");
  });

  it("throws for TTL out of bounds", () => {
    expect(() => writeGrant("/tmp/grants", "x", 0)).toThrow("Invalid TTL");
    expect(() => writeGrant("/tmp/grants", "x", 86401)).toThrow("Invalid TTL");
  });

  it("returns correct metadata", () => {
    const result = writeGrant("/tmp/grants", "elevate", 1800);
    expect(result.expiresInSeconds).toBe(1800);
    expect(result.grantPath).toBe("/tmp/grants/elevate.grant");
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = Math.floor(result.expiresAt.getTime() / 1000);
    expect(expSec - nowSec).toBeGreaterThanOrEqual(1799);
  });
});

describe("revokeGrant", () => {
  it("returns true when file exists", () => {
    mockUnlinkSync.mockImplementation(() => undefined);
    expect(revokeGrant("/tmp/grants", "my-secret")).toBe(true);
  });

  it("returns false when file does not exist", () => {
    mockUnlinkSync.mockImplementation(() => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); });
    expect(revokeGrant("/tmp/grants", "my-secret")).toBe(false);
  });

  it("throws for invalid name", () => {
    expect(() => revokeGrant("/tmp/grants", "../../etc/passwd")).toThrow("Invalid grant name");
  });
});

describe("readGrant", () => {
  it("returns granted=false when file missing", () => {
    mockReadFileSync.mockImplementation(() => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); });
    const g = readGrant("/tmp/grants", "x");
    expect(g.granted).toBe(false);
  });

  it("returns granted=true for future timestamp", () => {
    const future = Math.floor(Date.now() / 1000) + 300;
    mockReadFileSync.mockReturnValue(String(future));
    const g = readGrant("/tmp/grants", "x");
    expect(g.granted).toBe(true);
  });

  it("returns granted=false for expired timestamp", () => {
    const past = Math.floor(Date.now() / 1000) - 300;
    mockReadFileSync.mockReturnValue(String(past));
    const g = readGrant("/tmp/grants", "x", 0);
    expect(g.granted).toBe(false);
  });
});
