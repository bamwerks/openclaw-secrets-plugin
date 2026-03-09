import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { invokeBroker } from "../src/broker.js";

type ExecFileCb = (err: NodeJS.ErrnoException | null, result?: { stdout: string; stderr: string }) => void;

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

function mockSuccess(stdout: string) {
  mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: object, cb: ExecFileCb) => {
    cb(null, { stdout, stderr: "" });
  });
}

function mockFailure(code: number) {
  mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: object, cb: ExecFileCb) => {
    const err = Object.assign(new Error(`exit ${code}`), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    cb(err);
  });
}

const ALLOWED = new Set(["test-connection", "rotate-token"]);
const BROKER = "/usr/local/libexec/openclaw/secrets-broker";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invokeBroker", () => {
  it("throws for invalid name", async () => {
    await expect(invokeBroker(BROKER, "../bad", "test-connection", [], ALLOWED)).rejects.toThrow(
      "Invalid name"
    );
  });

  it("throws for invalid command format", async () => {
    await expect(invokeBroker(BROKER, "my-secret", "bad;cmd", [], ALLOWED)).rejects.toThrow(
      "Invalid command format"
    );
  });

  it("throws when command not in whitelist", async () => {
    await expect(
      invokeBroker(BROKER, "my-secret", "rm-everything", [], ALLOWED)
    ).rejects.toThrow("not in the allowedCommands whitelist");
  });

  it("throws for args with shell metacharacters", async () => {
    await expect(
      invokeBroker(BROKER, "my-secret", "test-connection", ["$(evil)"], ALLOWED)
    ).rejects.toThrow("disallowed characters");
  });

  it("returns success on exit code 0", async () => {
    mockSuccess("Connection OK\n");
    const r = await invokeBroker(BROKER, "db-pass", "test-connection", [], ALLOWED);
    expect(r.success).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it("returns failure on non-zero exit", async () => {
    mockFailure(2);
    const r = await invokeBroker(BROKER, "db-pass", "test-connection", [], ALLOWED);
    expect(r.success).toBe(false);
  });

  it("passes name and command as separate argv elements via sudo (no shell)", async () => {
    mockSuccess("ok");
    await invokeBroker(BROKER, "db-pass", "test-connection", ["--host=localhost"], ALLOWED);
    const [calledBin, calledArgs] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(calledBin).toBe("/usr/bin/sudo");
    expect(calledArgs).toContain("-n");
    expect(calledArgs).toContain("sirbam");
    expect(calledArgs).toContain("db-pass");
    expect(calledArgs).toContain("test-connection");
    expect(calledArgs).toContain("--host=localhost");
  });
});
