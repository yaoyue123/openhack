import type { ToolDef, ToolResult, ToolContext } from "./types.js";

export function defineTool(opts: {
  id: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;
}): ToolDef {
  return opts;
}
