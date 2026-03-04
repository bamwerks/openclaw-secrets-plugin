import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function fetchFromKeychain(
  secretsBin: string,
  name: string
): Promise<string> {
  const { stdout, stderr } = await exec(secretsBin, ["get", name], {
    timeout: 5000,
  });
  if (stderr.trim()) throw new Error(`secrets error: ${stderr.trim()}`);
  return stdout.trim();
}
