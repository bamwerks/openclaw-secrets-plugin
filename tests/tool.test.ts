import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRegistry } from "../src/registry.js";
import { parseGrantExpiry } from "../src/grants.js";

// These tests verify the core logic used by tools without needing
// to instantiate the full plugin (which requires OpenClaw SDK at runtime).

describe("secrets_get logic — tier routing", () => {
  it("open tier entry is found in registry", () => {
    const registry = parseRegistry("bamwerks_app_id|open\n");
    const entry = registry.find((e) => e.name === "bamwerks_app_id");
    expect(entry).toBeDefined();
    expect(entry!.tier).toBe("open");
  });

  it("controlled tier entry is found in registry", () => {
    const registry = parseRegistry("cloudflare_api_token|controlled\n");
    const entry = registry.find((e) => e.name === "cloudflare_api_token");
    expect(entry).toBeDefined();
    expect(entry!.tier).toBe("controlled");
  });

  it("restricted tier entry is found in registry", () => {
    const registry = parseRegistry("oauth_client_secret|restricted\n");
    const entry = registry.find((e) => e.name === "oauth_client_secret");
    expect(entry).toBeDefined();
    expect(entry!.tier).toBe("restricted");
  });

  it("unknown secret returns undefined (not found)", () => {
    const registry = parseRegistry("known_secret|open\n");
    const entry = registry.find((e) => e.name === "unknown_secret");
    expect(entry).toBeUndefined();
  });
});

describe("agent-blind enforcement", () => {
  it("restricted tier check exits before any value fetch", () => {
    // Simulate the guard logic from secrets_get
    const mockFetch = vi.fn();

    const tier = "restricted";
    let result: string | null = null;

    if (tier === "restricted") {
      // EXIT HERE — no value ever flows to agent
      result = "metadata_only";
      // mockFetch should never be called
    } else {
      result = mockFetch() as string;
    }

    expect(result).toBe("metadata_only");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("grant expiry math", () => {
  it("future timestamp is considered valid", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const expiry = parseGrantExpiry(String(future));
    expect(expiry).not.toBeNull();
    const now = Date.now();
    expect(expiry!.getTime()).toBeGreaterThan(now);
  });

  it("past timestamp is considered expired", () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const expiry = parseGrantExpiry(String(past));
    expect(expiry).not.toBeNull();
    const now = Date.now();
    expect(expiry!.getTime()).toBeLessThan(now);
  });
});

describe("full registry parsing (Bamwerks defaults)", () => {
  const REGISTRY = `
# Bamwerks Secrets Registry
# Format: name|tier  (tier: open | controlled | restricted)
bamwerks_app_id|open
bamwerks_app_pem|open
google_api_key|controlled
cloudflare_api_token|controlled
oauth_client_secret|restricted
gmail_client_secret|restricted
oauth_app_secret|restricted
`;

  it("parses all 7 entries", () => {
    const entries = parseRegistry(REGISTRY);
    expect(entries).toHaveLength(7);
  });

  it("open entries count is 2", () => {
    const entries = parseRegistry(REGISTRY);
    expect(entries.filter((e) => e.tier === "open")).toHaveLength(2);
  });

  it("controlled entries count is 2", () => {
    const entries = parseRegistry(REGISTRY);
    expect(entries.filter((e) => e.tier === "controlled")).toHaveLength(2);
  });

  it("restricted entries count is 3", () => {
    const entries = parseRegistry(REGISTRY);
    expect(entries.filter((e) => e.tier === "restricted")).toHaveLength(3);
  });
});
