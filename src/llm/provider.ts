import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LLMConfig } from "../config/schema.js";

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface Provider {
  modelId: string;
  languageModel(): LanguageModelV3;
  fallbackModelId?: string;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a model invocation function with exponential backoff retry.
 * Retries on network errors, 429 (rate limit), and 5xx server errors.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retryConfig: RetryConfig = DEFAULT_RETRY,
  label: string = "LLM call",
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err.statusCode ?? err.status ?? 0;

      // Don't retry 4xx errors other than 429 (rate limit)
      if (status >= 400 && status < 500 && status !== 429) {
        throw err;
      }

      if (attempt >= retryConfig.maxRetries) break;

      // Exponential backoff with jitter
      const delay = Math.min(
        retryConfig.initialDelayMs * Math.pow(2, attempt),
        retryConfig.maxDelayMs,
      );
      const jitter = Math.random() * 0.3 * delay;
      await sleep(delay + jitter);
    }
  }
  throw lastError ?? new Error(`${label} failed after ${retryConfig.maxRetries + 1} attempts`);
}

export function createProvider(config: LLMConfig): Provider {
  const primary = createOpenAICompatible({
    name: "openhack",
    baseURL: config.baseURL,
    apiKey: config.apiKey || "unused",
  });

  // Build provider with retry-wrapped language model
  const retryConfig: RetryConfig = {
    maxRetries: (config as any).maxRetries ?? DEFAULT_RETRY.maxRetries,
    initialDelayMs: (config as any).initialDelayMs ?? DEFAULT_RETRY.initialDelayMs,
    maxDelayMs: (config as any).maxDelayMs ?? DEFAULT_RETRY.maxDelayMs,
  };

  let fallbackProvider: ReturnType<typeof createOpenAICompatible> | null = null;
  let fallbackModel: string | undefined;

  // Check for fallback config in the llm config
  const configAny = config as any;
  if (configAny.fallbackModel || configAny.fallbackBaseURL) {
    fallbackModel = configAny.fallbackModel ?? config.model;
    const fallbackURL = configAny.fallbackBaseURL ?? config.baseURL;
    fallbackProvider = createOpenAICompatible({
      name: "openhack-fallback",
      baseURL: fallbackURL,
      apiKey: (configAny.fallbackApiKey ?? config.apiKey) || "unused",
    });
  }

  const primaryModelId = config.model;

  return {
    modelId: primaryModelId,
    get fallbackModelId() {
      return fallbackModel;
    },
    languageModel: () => {
      // Return a wrapper LanguageModelV3 that adds retry
      const primaryModel = primary(primaryModelId);
      const primaryModelIdConst = primaryModelId;

      if (!fallbackProvider) {
        // No fallback: just wrap with retry
        return new Proxy(primaryModel, {
          get(target, prop, receiver) {
            const orig = Reflect.get(target, prop, receiver);
            if (typeof orig !== "function") return orig;
            return (...args: any[]) => withRetry(
              () => orig.apply(target, args as any),
              retryConfig,
              `LLM call (${String(prop)})`,
            );
          },
        }) as LanguageModelV3;
      }

      // With fallback: try primary, then fallback
      const fallbackModelInstance = fallbackProvider(fallbackModel!);
      const fallbackModelIdConst = fallbackModel;

      return new Proxy(primaryModel, {
        get(target, prop, receiver) {
          const orig = Reflect.get(target, prop, receiver);
          if (typeof orig !== "function") return orig;
          return async (...args: any[]) => {
            try {
              return await withRetry(
                () => orig.apply(target, args as any),
                retryConfig,
                `LLM call (${String(prop)})`,
              );
            } catch (primaryErr) {
              // Fallback on failure
              const fbFunc = Reflect.get(fallbackModelInstance, prop, fallbackModelInstance);
              if (typeof fbFunc === "function") {
                return fbFunc.apply(fallbackModelInstance, args as any);
              }
              throw primaryErr;
            }
          };
        },
      }) as LanguageModelV3;
    },
  };
}
