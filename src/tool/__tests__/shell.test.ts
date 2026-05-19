import { describe, it, expect } from "vitest";
import { ShellTool } from "../shell.js";
import type { ToolContext } from "../types.js";

const mockCtx: ToolContext = {
  workingDir: process.cwd(),
  sessionId: "test",
  permissionCheck: async () => true,
};

describe("ShellTool", () => {
  it("echo hello returns output without error", async () => {
    const result = await ShellTool.execute({ command: "echo hello" }, mockCtx);
    expect(result.output.trim()).toBe("hello");
    expect(result.error).toBeFalsy();
  });

  it("ls nonexistent dir returns error", async () => {
    const result = await ShellTool.execute(
      { command: "ls /nonexistent_dir_xyz" },
      mockCtx,
    );
    expect(result.error).toBe(true);
  });
});
