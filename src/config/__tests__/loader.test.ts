import { describe, it, expect } from "vitest";
import { ConfigLoader } from "../loader.js";

describe("ConfigLoader", () => {
  it("returns defaults when no config file exists", async () => {
    const loader = new ConfigLoader();
    const config = await loader.load("/tmp/nonexistent_path_xyz");
    expect(config.llm.baseURL).toBe("http://localhost:11434/v1");
    expect(config.llm.model).toBe("default");
  });

  it("has default baseURL of http://localhost:11434/v1", async () => {
    const loader = new ConfigLoader();
    const config = await loader.load("/tmp/nonexistent_path_xyz");
    expect(config.llm.baseURL).toBe("http://localhost:11434/v1");
  });

  it("has default model of 'default'", async () => {
    const loader = new ConfigLoader();
    const config = await loader.load("/tmp/nonexistent_path_xyz");
    expect(config.llm.model).toBe("default");
  });

  it("has permissions.default as an array", async () => {
    const loader = new ConfigLoader();
    const config = await loader.load("/tmp/nonexistent_path_xyz");
    expect(Array.isArray(config.permissions.default)).toBe(true);
  });
});
