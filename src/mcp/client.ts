import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../config/schema.js";
import type { ToolDef, ToolResult, ToolContext } from "../tool/types.js";

export interface MCPConnection {
  name: string;
  client: Client;
  tools: ToolDef[];
}

export async function connectMCP(
  name: string,
  config: MCPServerConfig,
): Promise<MCPConnection> {
  const client = new Client({ name: "openhack", version: "0.1.0" });

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env
      ? ({ ...process.env, ...config.env } as Record<string, string>)
      : undefined,
  });

  await client.connect(transport);
  const { tools: mcpTools } = await client.listTools();

  const tools: ToolDef[] = mcpTools.map((t) => ({
    id: `${name}__${t.name}`,
    description: t.description ?? "",
    parameters: {
      type: "object" as const,
      properties:
        (t.inputSchema?.properties as Record<string, object>) ?? {},
      required: t.inputSchema?.required as string[] | undefined,
    },
    async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
      const result = await client.callTool({
        name: t.name,
        arguments: args,
      });
      const contentItems = (result.content ?? []) as Array<
        { type: "text"; text: string } | { type: string; [k: string]: unknown }
      >;
      const textContent = contentItems
        .filter(
          (c): c is { type: "text"; text: string } => c.type === "text",
        )
        .map((c) => c.text)
        .join("\n");
      return { output: textContent || "(no output)" };
    },
  }));

  return { name, client, tools };
}

export async function disconnectMCP(conn: MCPConnection): Promise<void> {
  await conn.client.close();
}
