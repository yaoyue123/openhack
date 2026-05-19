import { describe, it, expect } from "vitest";
import { createProvider } from "../provider.js";

describe("createProvider", () => {
  it("returns a defined provider with correct modelId", () => {
    const provider = createProvider({
      baseURL: "http://localhost:11434/v1",
      model: "test-model",
      apiKey: "unused",
    });
    expect(provider).toBeDefined();
    expect(provider.modelId).toBe("test-model");
  });
});
