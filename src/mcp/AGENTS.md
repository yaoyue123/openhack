# MCP Servers

Standalone MCP (Model Context Protocol) processes that expose CTF category tools via stdio. Each server wraps CLI tools (binwalk, objdump, sqlmap, etc.) and the client bridges them into the agent's tool system.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add a tool to a server | `*-server.ts` | Add entry to `ListToolsRequestSchema` tools array + handler in `CallToolRequestSchema` |
| Add a new MCP server | New `*-server.ts` | Follow existing pattern: Server + StdioServerTransport + two request handlers |
| Change how servers connect | `client.ts` | `connectMCP()` spawns server process, discovers tools, wraps as `ToolDef` |
| Change server lifecycle | `lifecycle.ts` | `MCPLifecycle` class: startAll/startOne/stopAll |
| Configure which servers run | `src/config/schema.ts` | `mcpServers: Record<string, MCPServerConfig>` in config |
| Wire MCP tools into agent | `client.ts` line 29 | Tool IDs are namespaced `${serverName}__${toolName}` |

## Server Tool Inventories

- **forensics-server.ts**: `binwalk_extract`, `exiftool_read`, `volatility_analyze`, `tshark_capture`
- **pwn-server.ts**: `checksec`, `disassemble`, `run_exploit`
- **rev-server.ts**: `ghidra_decompile`, `strings_extract`, `hexdump`, `r2_analyze`
- **web-server.ts**: `dirb_scan`, `nikto_scan`, `sqlmap_run`, `curl_request`, `jwt_decode`

## CONVENTIONS

- Each server is a standalone Node process communicating over stdio via `StdioServerTransport`
- No barrel `index.ts`; servers are started by command path from config
- Tool registration uses raw `inputSchema` objects (plain JSON Schema, not Zod at runtime)
- Tool handlers dispatch CLI tools via `execa` with timeouts and `maxBuffer: 1024 * 1024`
- Output truncated at `MAX_OUTPUT = 50000` chars. `pwn-server` inlines the same limit inline
- Errors use shared `makeError()` helper (except `pwn-server` which has its own inline format)
- Fallback commands: `vol` falls back to `volatility3`, `checksec` to `readelf`, `xxd` to `od`
- `ghidra_decompile` generates a Python script to `/tmp` and runs `analyzeHeadless`
- `GHIDRA_HOME` env var overrides `/opt/ghidra` default path
- `MCPServerConfig` = `{ command, args, env? }` from `src/config/schema.ts`
- `connectMCP` merges `config.env` into `process.env` when spawning server

## ANTI-PATTERNS

- Do NOT add a barrel `index.ts`; servers run as independent processes
- Do NOT import server files from the rest of `src/`; they are entry points, not libraries
- Do NOT use Zod in servers at runtime; `inputSchema` is plain JSON Schema for MCP protocol
- Do NOT share state between servers; each is a separate process with its own memory
- Do NOT forget to add `isError: true` on error responses
- Do NOT skip the fallback catch blocks for tools that try alternate commands
