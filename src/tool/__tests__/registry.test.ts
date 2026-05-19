import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../registry.js";

describe("ToolRegistry", () => {
  it("createBuiltin returns all 8 tools", () => {
    const registry = ToolRegistry.createBuiltin();
    const tools = registry.all();
    expect(tools).toHaveLength(8);

    const ids = tools.map((t) => t.id).sort();
    expect(ids).toEqual(
      ["bash", "read", "write", "edit", "glob", "grep", "webfetch", "flag"].sort(),
    );
  });

  it("toAITools returns correct format", () => {
    const registry = ToolRegistry.createBuiltin();
    const aiTools = registry.toAITools();

    expect(aiTools.bash).toBeDefined();
    expect(aiTools.bash.description).toBeTruthy();
    expect(aiTools.bash.parameters).toBeDefined();
    expect(aiTools.bash.parameters.type).toBe("object");
    expect(aiTools.bash.parameters.required).toContain("command");
  });

  it("get returns specific tool", () => {
    const registry = ToolRegistry.createBuiltin();
    const bash = registry.get("bash");
    expect(bash).toBeDefined();
    expect(bash!.id).toBe("bash");
  });

  it("get returns undefined for unknown tool", () => {
    const registry = ToolRegistry.createBuiltin();
    expect(registry.get("nonexistent")).toBeUndefined();
  });
});
