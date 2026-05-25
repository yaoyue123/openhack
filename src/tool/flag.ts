import { defineTool } from "./define.js";

export const FLAG_PATTERNS = [
  /flag\{[^}]+\}/gi,
  /HTB\{[^}]+\}/gi,
  /CTF\{[^}]+\}/gi,
  /picoCTF\{[^}]+\}/gi,
  /csawctf\{[^}]+\}/gi,
];

/**
 * Base64 pattern: matches strings that look like base64-encoded data.
 * Valid base64: alphanumeric + / + =, typically 16+ chars, length divisible by 4.
 */
const BASE64_PATTERN = /[A-Za-z0-9+/]{16,}={0,2}/g;

/**
 * Try to decode base64 strings in the text and check if they contain flags.
 * CTF challenges often base64-encode flags before RSA/AES encryption.
 */
function detectBase64EncodedFlags(text: string): string[] {
  const flags: string[] = [];
  BASE64_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BASE64_PATTERN.exec(text)) !== null) {
    try {
      const candidate = match[0];
      // Skip obvious non-base64 (like hex strings, file paths)
      if (/^[0-9a-f]+$/.test(candidate)) continue;
      // Must be valid base64 length
      if (candidate.length % 4 !== 0) continue;

      const decoded = Buffer.from(candidate, "base64").toString("utf-8");

      // Check if decoded text contains any flag pattern
      for (const pattern of FLAG_PATTERNS) {
        pattern.lastIndex = 0;
        let flagMatch: RegExpExecArray | null;
        while ((flagMatch = pattern.exec(decoded)) !== null) {
          flags.push(flagMatch[0]);
        }
      }
    } catch {
      // Not valid base64, skip
    }
  }
  return flags;
}

export function detectFlags(text: string): string[] {
  const flags = new Set<string>();

  // Direct flag pattern matching
  for (const pattern of FLAG_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      flags.add(match[0]);
    }
  }

  // Check for base64-encoded flags
  const b64Flags = detectBase64EncodedFlags(text);
  for (const f of b64Flags) {
    flags.add(f);
  }

  return [...flags];
}

export const FlagTool = defineTool({
  id: "flag",
  description:
    "Detect CTF flag patterns in the provided text.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to scan for CTF flags",
      },
    },
    required: ["text"],
  },
  execute: async (args) => {
    const flags = detectFlags(args.text);
    if (flags.length === 0) {
      return { output: "No flags detected" };
    }
    return {
      output: `Detected ${flags.length} flag(s):\n${flags.join("\n")}`,
      metadata: { flags },
    };
  },
});
