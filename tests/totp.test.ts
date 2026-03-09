import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process — execFile must be callback-style so promisify works
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { validateTotp } from "../src/totp.js";

// execFile is callback-based: (bin, args, opts, callback) => void
type ExecFileCb = (err: NodeJS.ErrnoException | null, result?: { stdout: string; stderr: string }) => void;
type MockedExecFile = (bin: string, args: string[], opts: object, cb: ExecFileCb) => void;

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

function mockSuccess() {
  mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: object, cb: ExecFileCb) => {
    cb(null, { stdout: "", stderr: "" });
  });
}

function mockExitCode(code: number) {
  mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: object, cb: ExecFileCb) => {
    const err = Object.assign(new Error(`exit ${code}`), { code }) as unknown as NodeJS.ErrnoException;
    cb(err);
  });
}

function mockEnoent() {
  mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: object, cb: ExecFileCb) => {
    const err = Object.assign(new Error("spawn error"), { code: "ENOENT" }) as NodeJS.ErrnoException;
    cb(err);
  });
}

// Satisfy unused type reference
const _: MockedExecFile = mockExecFile;
void _;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateTotp", () => {
  it("returns invalid for non-6-digit codes without calling execFile", async () => {
    const r1 = await validateTotp("123");
    expect(r1.valid).toBe(false);
    expect(r1.error).toMatch(/6 digits/);

    const r2 = await validateTotp("1234567");
    expect(r2.valid).toBe(false);

    const r3 = await validateTotp("abc123");
    expect(r3.valid).toBe(false);

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("returns valid when script exits 0", async () => {
    mockSuccess();
    const r = await validateTotp("123456");
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("returns invalid (no error) when script exits 1", async () => {
    mockExitCode(1);
    const r = await validateTotp("000000");
    expect(r.valid).toBe(false);
    expect(r.error).toBeUndefined();
  });

  it("returns error message for unexpected failures (ENOENT etc)", async () => {
    mockEnoent();
    const r = await validateTotp("999999");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/TOTP validation error/);
  });
});
