import type { OpenhackConfig, MCPServerConfig } from "../config/schema.js";
import {
  connectMCP,
  disconnectMCP,
  type MCPConnection,
} from "./client.js";
import type { ToolDef } from "../tool/types.js";

export class MCPLifecycle {
  private connections: Map<string, MCPConnection> = new Map();

  async startAll(config: OpenhackConfig): Promise<ToolDef[]> {
    const tools: ToolDef[] = [];
    for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
      try {
        const conn = await connectMCP(name, mcpConfig);
        this.connections.set(name, conn);
        tools.push(...conn.tools);
      } catch (err) {
        console.error(`MCP server "${name}" failed to start:`, err);
      }
    }
    return tools;
  }

  async startOne(
    name: string,
    config: MCPServerConfig,
  ): Promise<ToolDef[]> {
    const conn = await connectMCP(name, config);
    this.connections.set(name, conn);
    return conn.tools;
  }

  async stopAll(): Promise<void> {
    for (const conn of this.connections.values()) {
      await disconnectMCP(conn);
    }
    this.connections.clear();
  }

  getActiveConnections(): string[] {
    return [...this.connections.keys()];
  }
}
