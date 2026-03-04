import { readFileSync } from "node:fs";
import type { RegistryEntry, Tier } from "./types.js";

const VALID_TIERS: Set<string> = new Set<Tier>(["open", "controlled", "restricted"]);

export function parseRegistry(content: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|");
    if (parts.length !== 2) continue;
    const name = parts[0]!.trim();
    const tier = parts[1]!.trim();
    if (!name || !VALID_TIERS.has(tier)) continue;
    entries.push({ name, tier: tier as Tier });
  }
  return entries;
}

export function loadRegistry(registryPath: string): RegistryEntry[] {
  try {
    const content = readFileSync(registryPath, "utf8");
    return parseRegistry(content);
  } catch {
    return [];
  }
}

export function findEntry(
  entries: RegistryEntry[],
  name: string
): RegistryEntry | undefined {
  return entries.find((e) => e.name === name);
}
