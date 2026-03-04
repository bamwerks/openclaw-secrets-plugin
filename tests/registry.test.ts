import { describe, it, expect } from "vitest";
import { parseRegistry } from "../src/registry.js";

describe("parseRegistry", () => {
  it("parses valid entries", () => {
    const content = `
# Comment line
bamwerks_app_id|open
cloudflare_api_token|controlled
oauth_client_secret|restricted
`;
    const entries = parseRegistry(content);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ name: "bamwerks_app_id", tier: "open" });
    expect(entries[1]).toEqual({ name: "cloudflare_api_token", tier: "controlled" });
    expect(entries[2]).toEqual({ name: "oauth_client_secret", tier: "restricted" });
  });

  it("ignores blank lines and comments", () => {
    const content = `
# header
# another comment

valid_secret|open

`;
    const entries = parseRegistry(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("valid_secret");
  });

  it("ignores invalid tiers", () => {
    const content = `
good_secret|open
bad_secret|supersecret
`;
    const entries = parseRegistry(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("good_secret");
  });

  it("ignores malformed lines (no pipe)", () => {
    const content = `
valid|open
invalid_no_pipe
also|invalid|too_many_pipes
`;
    const entries = parseRegistry(content);
    expect(entries).toHaveLength(1);
  });

  it("trims whitespace from names and tiers", () => {
    const content = `  my_secret  |  controlled  `;
    const entries = parseRegistry(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "my_secret", tier: "controlled" });
  });

  it("returns empty array for empty input", () => {
    expect(parseRegistry("")).toHaveLength(0);
    expect(parseRegistry("# only comments\n\n")).toHaveLength(0);
  });
});
