import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OpenhackConfig } from "./schema.js";
import { DEFAULT_CONFIG } from "./schema.js";

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

function stripJsoncComments(text: string): string {
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
  async load(projectDir: string): Promise<OpenhackConfig> {
    const jsoncPath = join(projectDir, "openhack.jsonc");
    const jsonPath = join(projectDir, "openhack.json");

    let raw: string | null = null;
    try {
      raw = await readFile(jsoncPath, "utf-8");
    } catch {
      try {
        raw = await readFile(jsonPath, "utf-8");
      } catch {
        // No config file found — use defaults
      }
    }

    if (raw === null) {
      return { ...DEFAULT_CONFIG };
    }

    const cleaned = stripJsoncComments(raw);
    const parsed = JSON.parse(cleaned) as Partial<OpenhackConfig>;
    return deepMerge({ ...DEFAULT_CONFIG }, parsed);
  }
}
