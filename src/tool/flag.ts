import { defineTool } from "./define.js";

export const FLAG_PATTERNS = [
  /flag\{[^}]+\}/gi,
  /HTB\{[^}]+\}/gi,
  /CTF\{[^}]+\}/gi,
  /picoCTF\{[^}]+\}/gi,
  /csawctf\{[^}]+\}/gi,
];

export function detectFlags(text: string): string[] {
  const flags = new Set<string>();
  for (const pattern of FLAG_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      flags.add(match[0]);
    }
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
