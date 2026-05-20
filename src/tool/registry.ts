import type { ToolDef } from "./types.js";
import { ShellTool } from "./shell.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { WebFetchTool } from "./webfetch.js";
import { FlagTool } from "./flag.js";
import { PythonTool } from "./python.js";

export class ToolRegistry {
  private tools: Map<string, ToolDef> = new Map();

  static createBuiltin(): ToolRegistry {
    const reg = new ToolRegistry();
    const builtins = [
      ShellTool,
      ReadTool,
      WriteTool,
      EditTool,
      GlobTool,
      GrepTool,
      WebFetchTool,
      FlagTool,
      PythonTool,
    ];
    for (const tool of builtins) reg.register(tool);
    return reg;
  }

  register(tool: ToolDef): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDef | undefined {
    return this.tools.get(id);
  }

  all(): ToolDef[] {
    return [...this.tools.values()];
  }

  toAITools(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const tool of this.tools.values()) {
      result[tool.id] = {
        description: tool.description,
        parameters: tool.parameters,
      };
    }
    return result;
  }
}
