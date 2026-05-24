import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { OpenhackConfig } from "./schema.js";
import { DEFAULT_CONFIG, parseConfig } from "./schema.js";

export const CONFIG_DIR = join(homedir(), ".config", "openhack");
export const CONFIG_PATH = join(CONFIG_DIR, "openhack.jsonc");

export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result as T;
}

export function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    if (text[i] === '"' && (i === 0 || text[i - 1] !== "\\")) {
      inString = !inString;
      result += text[i];
      i++;
    } else if (!inString && text[i] === "/" && text[i + 1] === "/") {
      // Skip until end of line
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

export class ConfigLoader {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? CONFIG_PATH;
  }

  async load(): Promise<OpenhackConfig> {
    let raw: string | null = null;
    try {
      raw = await readFile(this.configPath, "utf-8");
    } catch {
      // No config file — use defaults
    }

    let config: OpenhackConfig;
    if (raw === null) {
      config = parseConfig(DEFAULT_CONFIG);
    } else {
      const cleaned = stripJsoncComments(raw);
      const parsed = JSON.parse(cleaned);
      // Merge with defaults first, then validate
      const merged = deepMerge({ ...DEFAULT_CONFIG }, parsed);
      config = parseConfig(merged);
    }

    // Env vars override config file
    if (process.env.OPENHACK_LLM_BASE_URL) {
      config.llm.baseURL = process.env.OPENHACK_LLM_BASE_URL;
    }
    if (process.env.OPENHACK_LLM_MODEL) {
      config.llm.model = process.env.OPENHACK_LLM_MODEL;
    }
    if (process.env.OPENHACK_LLM_API_KEY) {
      config.llm.apiKey = process.env.OPENHACK_LLM_API_KEY;
    }

    return config;
  }

  async save(config: Partial<OpenhackConfig>): Promise<void> {
    const dir = join(this.configPath, "..");
    await mkdir(dir, { recursive: true });

    // Try to preserve JSONC comments by doing targeted in-file replacements
    try {
      const existing = await readFile(this.configPath, "utf-8");
      const updated = this.applyKeyUpdates(existing, config);
      if (updated !== null) {
        await writeFile(this.configPath, updated, "utf-8");
        return;
      }
    } catch {
      // No existing file or parse error — fall through to full write
    }

    // Fallback: full rewrite (loses comments)
    const json = JSON.stringify(config, null, 2);
    await writeFile(this.configPath, json, "utf-8");
  }

  /**
   * Attempt to apply config key updates to JSONC content via targeted line replacement.
   * Returns null if any key cannot be matched (falls back to full rewrite).
   */
  private applyKeyUpdates(content: string, config: Partial<OpenhackConfig>): string | null {
    let result = content;

    for (const [topKey, topValue] of Object.entries(config)) {
      if (topValue === null || topValue === undefined) continue;

      if (typeof topValue === "object" && !Array.isArray(topValue)) {
        // Update nested keys (e.g. llm.model, agent.maxSteps)
        for (const [subKey, subValue] of Object.entries(topValue as Record<string, unknown>)) {
          if (subValue === undefined) continue;
          const pattern = new RegExp(
            `("${subKey}"\\s*:\\s*)"[^"]*"`,
            "i",
          );
          const serialized = typeof subValue === "string"
            ? `"${subValue}"`
            : String(subValue);
          const replacement = `$1${serialized}`;
          const prev = result;
          result = result.replace(pattern, replacement);
          if (result === prev) return null; // Key not found
        }
      } else {
        // Update top-level key (unusual for this config structure)
        const serialized = typeof topValue === "string"
          ? `"${topValue}"`
          : String(topValue);
        const pattern = new RegExp(
          `("${topKey}"\\s*:\\s*)"[^"]*"`,
          "i",
        );
        const replacement = `$1${serialized}`;
        const prev = result;
        result = result.replace(pattern, replacement);
        if (result === prev) return null; // Key not found
      }
    }

    return result;
  }

  async exists(): Promise<boolean> {
    try {
      await readFile(this.configPath, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
