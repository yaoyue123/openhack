import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigLoader } from "../loader.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const TEST_CONFIG_PATH = "/tmp/test-openhack-config.jsonc";

describe("ConfigLoader", () => {
  beforeEach(async () => {
    try { await rm(TEST_CONFIG_PATH); } catch { /* not exists */ }
  });

  afterEach(async () => {
    try { await rm(TEST_CONFIG_PATH); } catch { /* not exists */ }
  });

  it("returns defaults when no config file exists", async () => {
    const loader = new ConfigLoader("/tmp/nonexistent_path_xyz");
    const config = await loader.load();
    expect(config.llm.baseURL).toBe("http://localhost:11434/v1");
    expect(config.llm.model).toBe("default");
  });

  it("has default baseURL of http://localhost:11434/v1", async () => {
    const loader = new ConfigLoader("/tmp/nonexistent_path_xyz");
    const config = await loader.load();
    expect(config.llm.baseURL).toBe("http://localhost:11434/v1");
  });

  it("has default model of 'default'", async () => {
    const loader = new ConfigLoader("/tmp/nonexistent_path_xyz");
    const config = await loader.load();
    expect(config.llm.model).toBe("default");
  });

  it("has permissions.default as an array", async () => {
    const loader = new ConfigLoader("/tmp/nonexistent_path_xyz");
    const config = await loader.load();
    expect(Array.isArray(config.permissions.default)).toBe(true);
  });

  it("has default agent config", async () => {
    const loader = new ConfigLoader("/tmp/nonexistent_path_xyz");
    const config = await loader.load();
    expect(config.agent.maxSteps).toBe(25);
    expect(config.agent.timeout).toBe(300);
  });

  it("has default skills config", async () => {
    const loader = new ConfigLoader("/tmp/nonexistent_path_xyz");
    const config = await loader.load();
    expect(config.skills.maxCompanionBytes).toBe(15000);
  });

  it("reads config from file", async () => {
    await mkdir(join(TEST_CONFIG_PATH, ".."), { recursive: true });
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({
        llm: { baseURL: "https://api.example.com/v1", model: "gpt-4", apiKey: "test-key" },
      }),
    );
    const loader = new ConfigLoader(TEST_CONFIG_PATH);
    const config = await loader.load();
    expect(config.llm.baseURL).toBe("https://api.example.com/v1");
    expect(config.llm.model).toBe("gpt-4");
    expect(config.llm.apiKey).toBe("test-key");
  });

  it("env vars override config file", async () => {
    await mkdir(join(TEST_CONFIG_PATH, ".."), { recursive: true });
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({
        llm: { baseURL: "https://file.example.com/v1", model: "file-model", apiKey: "file-key" },
      }),
    );
    const originalBase = process.env.OPENHACK_LLM_BASE_URL;
    const originalModel = process.env.OPENHACK_LLM_MODEL;
    const originalKey = process.env.OPENHACK_LLM_API_KEY;
    process.env.OPENHACK_LLM_BASE_URL = "https://env.example.com/v1";
    process.env.OPENHACK_LLM_MODEL = "env-model";
    process.env.OPENHACK_LLM_API_KEY = "env-key";
    try {
      const loader = new ConfigLoader(TEST_CONFIG_PATH);
      const config = await loader.load();
      expect(config.llm.baseURL).toBe("https://env.example.com/v1");
      expect(config.llm.model).toBe("env-model");
      expect(config.llm.apiKey).toBe("env-key");
    } finally {
      if (originalBase === undefined) delete process.env.OPENHACK_LLM_BASE_URL;
      else process.env.OPENHACK_LLM_BASE_URL = originalBase;
      if (originalModel === undefined) delete process.env.OPENHACK_LLM_MODEL;
      else process.env.OPENHACK_LLM_MODEL = originalModel;
      if (originalKey === undefined) delete process.env.OPENHACK_LLM_API_KEY;
      else process.env.OPENHACK_LLM_API_KEY = originalKey;
    }
  });

  it("deep merges partial config with defaults", async () => {
    await mkdir(join(TEST_CONFIG_PATH, ".."), { recursive: true });
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({ llm: { model: "custom-model" } }),
    );
    const loader = new ConfigLoader(TEST_CONFIG_PATH);
    const config = await loader.load();
    expect(config.llm.model).toBe("custom-model");
    expect(config.llm.baseURL).toBe("http://localhost:11434/v1");
    expect(config.agent.maxSteps).toBe(25);
  });

  it("reads JSONC with comments", async () => {
    await mkdir(join(TEST_CONFIG_PATH, ".."), { recursive: true });
    await writeFile(
      TEST_CONFIG_PATH,
      `{
  // A comment
  "llm": {
    "baseURL": "https://jsonc.example.com/v1"
  }
}`,
    );
    const loader = new ConfigLoader(TEST_CONFIG_PATH);
    const config = await loader.load();
    expect(config.llm.baseURL).toBe("https://jsonc.example.com/v1");
  });
});
