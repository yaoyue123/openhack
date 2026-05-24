import { encoding_for_model, type Tiktoken, type TiktokenModel } from "tiktoken";

/**
 * Thread-safe wrapper around tiktoken with lazy per-encoding caching.
 * Falls back to char/4 estimation when model is unknown or tiktoken fails.
 */

let _enc: Tiktoken | null = null;
let _encModel: string | null = null;

/**
 * Common model-to-encoding mapping.
 * Covers most OpenAI models; falls back to cl100k_base for unknown models.
 */
function encodingNameForModel(model: string): string {
  const lower = model.toLowerCase();

  // o-series
  if (lower.startsWith("o1") || lower.startsWith("o3")) return "o200k_base";

  // gpt-4o series
  if (lower.includes("gpt-4o") || lower.includes("gpt-4.5")) return "o200k_base";

  // gpt-4 series (except 4o)
  if (lower.startsWith("gpt-4")) return "cl100k_base";

  // gpt-3.5 series
  if (lower.startsWith("gpt-3.5") || lower.startsWith("gpt-35")) return "cl100k_base";

  // text-embedding
  if (lower.startsWith("text-embedding")) return "cl100k_base";

  // DeepSeek series (V2, V3, R1, flash) — closest to o200k_base
  if (lower.includes("deepseek")) return "o200k_base";

  // Default for Ollama/local models — most use a llama/GPT-2 tokenizer
  return "cl100k_base";
}

/**
 * Estimate the number of tokens in a text string using tiktoken.
 * Falls back to char/4 if tiktoken is unavailable or model is unknown.
 */
export function estimateTokens(text: string, model?: string): number {
  if (!text) return 0;

  try {
    const encName = model ? encodingNameForModel(model) : "cl100k_base";

    // Reuse cached encoding if same model
    if (_enc === null || _encModel !== encName) {
      _enc?.free();
      _enc = encoding_for_model(encName as TiktokenModel) as unknown as Tiktoken;
      _encModel = encName;
    }

    const tokens = _enc.encode(text);
    return tokens.length;
  } catch {
    // Fallback: char / 4 heuristic (rough estimate)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens in a batch of message contents.
 * More accurate than sum of per-message estimates for aggregated payloads.
 */
export function estimateMessageTokens(
  contents: string[],
  model?: string,
): number {
  const joined = contents.filter(Boolean).join("\n");
  return estimateTokens(joined, model);
}

/**
 * Free the cached encoding. Call when shutting down.
 */
export function freeTokenCounter(): void {
  _enc?.free();
  _enc = null;
  _encModel = null;
}
