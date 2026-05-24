import { describe, it, expect } from "vitest";
import { resolveSecurePath, isCommandAllowed } from "../security.js";
import * as path from "node:path";

describe("resolveSecurePath", () => {
  const baseDir = "/tmp/openhack-test";

  it("resolves normal paths within base", () => {
    const result = resolveSecurePath("file.txt", baseDir);
    expect(result).toBe(path.resolve(baseDir, "file.txt"));
  });

  it("resolves subdirectory paths", () => {
    const result = resolveSecurePath("sub/file.txt", baseDir);
    expect(result).toBe(path.resolve(baseDir, "sub/file.txt"));
  });

  it("throws on directory traversal with ../", () => {
    expect(() => resolveSecurePath("../secret.txt", baseDir)).toThrow(
      "Path traversal detected",
    );
  });

  it("throws on directory traversal with absolute path", () => {
    expect(() =>
      resolveSecurePath("/etc/passwd", baseDir),
    ).toThrow("Path traversal detected");
  });

  it("allows paths within base even with ../ that resolve inside", () => {
    const result = resolveSecurePath("sub/../file.txt", baseDir);
    expect(result).toBe(path.resolve(baseDir, "file.txt"));
  });
});

describe("isCommandAllowed", () => {
  it("allows basic commands", () => {
    expect(isCommandAllowed("ls -la")).toBe(true);
    expect(isCommandAllowed("cat file.txt")).toBe(true);
  });

  it("blocks rm -rf /", () => {
    expect(isCommandAllowed("rm -rf /")).toBe(false);
    expect(isCommandAllowed("sudo rm -rf /*")).toBe(false);
  });

  it("blocks dd command", () => {
    expect(isCommandAllowed("dd if=/dev/zero of=/dev/sda")).toBe(false);
    expect(isCommandAllowed("dd")).toBe(false);
  });

  it("blocks mkfs and format commands", () => {
    expect(isCommandAllowed("mkfs.ext4 /dev/sda1")).toBe(false);
    expect(isCommandAllowed("mkfs /dev/sda1")).toBe(false);
  });

  it("blocks shutdown and reboot", () => {
    expect(isCommandAllowed("shutdown -h now")).toBe(false);
    expect(isCommandAllowed("reboot")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isCommandAllowed("RM -RF /")).toBe(false);
    expect(isCommandAllowed("DD if=/dev/zero of=/dev/sda")).toBe(false);
  });
});
