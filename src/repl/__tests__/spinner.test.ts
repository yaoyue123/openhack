import { describe, it, expect } from "vitest";
import { getToolStatus, TOOL_STATUS_MAP } from "../types.js";

describe("getToolStatus", () => {
  it("maps read tools to 'reading'", () => {
    expect(getToolStatus("read")).toBe("reading");
    expect(getToolStatus("glob")).toBe("reading");
    expect(getToolStatus("grep")).toBe("reading");
  });

  it("maps execution tools to 'executing'", () => {
    expect(getToolStatus("bash")).toBe("executing");
    expect(getToolStatus("python")).toBe("executing");
  });

  it("maps write tools to 'writing'", () => {
    expect(getToolStatus("write")).toBe("writing");
    expect(getToolStatus("edit")).toBe("writing");
  });

  it("defaults unknown tools to 'analyzing'", () => {
    expect(getToolStatus("flag")).toBe("analyzing");
    expect(getToolStatus("webfetch")).toBe("analyzing");
    expect(getToolStatus("unknown")).toBe("analyzing");
  });

  it("all TOOL_STATUS_MAP values are valid AgentStatus", () => {
    const validStatuses = ["reading", "executing", "writing"];
    for (const status of Object.values(TOOL_STATUS_MAP)) {
      expect(validStatuses).toContain(status);
    }
  });
});
