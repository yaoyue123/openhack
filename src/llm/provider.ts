import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LLMConfig } from "../config/schema.js";

export interface Provider {
  modelId: string;
  languageModel(): LanguageModelV3;
}

export function createProvider(config: LLMConfig): Provider {
  const sdk = createOpenAICompatible({
    name: "openhack",
    baseURL: config.baseURL,
    apiKey: config.apiKey || "unused",
  });
  return {
    modelId: config.model,
    languageModel: () => sdk(config.model),
  };
}
