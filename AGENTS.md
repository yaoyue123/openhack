# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-21
**Commit:** c3d8da0
**Branch:** master

## OVERVIEW

CTF AI agent with a three-layer architecture: Harness (code guards), Memory (persistence), Agent Loop (LLM-driven). TypeScript ESM CLI built with yargs, Vercel AI SDK, Effect (partial), tsup. Published as `@yaoyue123/opensec`.

## STRUCTURE

```
openhack/
├── src/
│   ├── index.ts          # CLI entry (yargs commands: init, chat, solve, sessions, resume, skills, config)
│   ├── agent-loop.ts     # Core loop: streamText + tool dispatch + harness hooks
│   ├── agent/            # Agent definitions (triage, crypto, pwn, web, reverse, forensics, misc)
│   ├── config/           # Zod-validated config schema + JSONC loader
│   ├── harness/          # LoopGuard, BudgetGuard, Terminator (see src/harness/AGENTS.md)
│   ├── llm/              # Provider factory (OpenAI-compatible via AI SDK)
│   ├── mcp/              # MCP servers for forensics, pwn, web, reverse + client (see src/mcp/AGENTS.md)
│   ├── memory/           # Persistent memory files + context compressor (see src/memory/AGENTS.md)
│   ├── permission/       # Allow/deny/ask rule evaluator
│   ├── repl/             # Ink-based TUI (React/TSX)
│   ├── runtime/          # Effect dependency injection (ConfigService)
│   ├── session/          # Session store (JSON files in ~/.openhack/sessions)
│   ├── skill/            # Skill loader (discovers SKILL.md + companion files)
│   └── tool/             # 13 built-in tools (see src/tool/AGENTS.md)
├── skills/               # Bundled CTF skill reference files (crypto, pwn, web, reverse, forensics, misc, triage)
├── .github/workflows/    # CI (typecheck/test/build) + Release (GitHub Release only, no npm publish)
└── docker/               # Docker runtime configs
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a CLI command | `src/index.ts` | yargs `.command()` chain |
| Add a new tool | `src/tool/<name>.ts` + register in `src/tool/registry.ts` | Use `defineTool()` factory |
| Add a new agent | `src/agent/types.ts` (AGENTS record) | Agent = name + system prompt + category |
| Change harness behavior | `src/harness/` | Facade class `Harness` in index.ts |
| Add MCP server | `src/mcp/<name>-server.ts` | Pattern: existing servers |
| Modify LLM interaction | `src/llm/provider.ts`, `src/agent-loop.ts` | AI SDK `streamText` call |
| Config schema changes | `src/config/schema.ts` | Zod types, `DEFAULT_CONFIG` |
| Change skill loading | `src/skill/loader.ts` + `src/skill/registry.ts` | Searches `skills/`, `~/.openhack/skills/`, `.openhack/skills/` |
| Test a tool | `src/tool/__tests__/` | vitest, mock ToolContext |

## CONVENTIONS

- **Pure ESM**: `"type": "module"`, all imports use `.js` extensions, `"module": "ESNext"`
- **File naming**: kebab-case (`loop-guard.ts`, `budget-guard.ts`)
- **Types colocated**: each module has `types.ts` with interfaces + `DEFAULT_*_CONFIG`
- **Barrel exports**: `index.ts` per module, facade class pattern
- **`import type`** for type-only imports always
- **Node builtins**: `node:` prefix (`import * as fs from "node:fs/promises"`)
- **Tool pattern**: `defineTool()` factory, export as PascalCase const (`ShellTool`, `ReadTool`)
- **Tests**: vitest, `__tests__/` subdirs, `<name>.test.ts` naming

## ANTI-PATTERNS (THIS PROJECT)

- Do NOT add CJS output -- project is ESM-only
- Do NOT use path aliases (`#/`) for same-module imports -- use relative `./` paths
- Do NOT import from `benchmark/` in src/ code
- `better-sqlite3` types are in devDeps but the package itself is missing -- do not use SQLite without adding the dep
- Release workflow does NOT publish to npm -- publishing is manual
- `publishConfig` is missing from package.json -- scoped packages need `access: "public"`

## UNIQUE STYLES

- Effect runtime (`src/runtime/app.ts`) uses `Context.Tag` + `Layer` for config DI, but most code is plain async/await -- Effect is only for config loading
- Harness injects hints via `onStepFinish` callback, not by modifying prompts directly
- Memory system reads/writes markdown files (state.md, findings.md, failed-paths.md, attack-log.md)
- Flag detection is a built-in tool (`flag`) that the terminator watches for
- Skill system discovers `SKILL.md` files + companion `.md` files in `skills/` directories

## COMMANDS

```bash
npm run dev          # tsx src/index.ts (no build)
npm run build        # tsup (ESM to dist/)
npm test             # vitest run
npm run typecheck    # tsc --noEmit
```

## NOTES

- tsup does NOT generate `.d.ts` files (`dts: true` not configured)
- No linter or formatter configured (no ESLint, no Prettier)
- CI tests Node 18, 20, 22 but no `engines` field in package.json
- `skills/` is bundled in npm package via `files` field (reference data, not runtime code)
- `.npmrc` is gitignored (contains auth token)
