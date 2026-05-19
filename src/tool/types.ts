export interface ToolContext {
  workingDir: string;
  sessionId: string;
  permissionCheck: (tool: string, pattern: string) => Promise<boolean>;
}

export interface ToolDef {
  id: string;
  description: string;
  parameters: Record<string, any>;
  execute(args: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  output: string;
  error?: boolean;
  metadata?: Record<string, any>;
}
