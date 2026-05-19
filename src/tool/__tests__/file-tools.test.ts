import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { WriteTool } from "../write.js";
import { ReadTool } from "../read.js";
import { EditTool } from "../edit.js";
import type { ToolContext } from "../types.js";

const testDir = "/tmp/openhack-test-file-tools";

const mockCtx: ToolContext = {
  workingDir: testDir,
  sessionId: "test",
  permissionCheck: async () => true,
};

describe("File tools", () => {
  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  it("write then read: writes content and reads it back with line numbers", async () => {
    const filePath = join(testDir, "test.txt");
    const content = "hello world\nline 2\n";

    const writeResult = await WriteTool.execute({ filePath, content }, mockCtx);
    expect(writeResult.error).toBeFalsy();

    const readResult = await ReadTool.execute({ filePath }, mockCtx);
    expect(readResult.error).toBeFalsy();
    expect(readResult.output).toContain("1: hello world");
    expect(readResult.output).toContain("2: line 2");
  });

  it("edit replaces exact string", async () => {
    const filePath = join(testDir, "edit-test.txt");
    await WriteTool.execute({ filePath, content: "foo bar baz" }, mockCtx);

    const editResult = await EditTool.execute(
      { filePath, oldString: "bar", newString: "QUX" },
      mockCtx,
    );
    expect(editResult.error).toBeFalsy();

    const readResult = await ReadTool.execute({ filePath }, mockCtx);
    expect(readResult.output).toContain("foo QUX baz");
  });
});
