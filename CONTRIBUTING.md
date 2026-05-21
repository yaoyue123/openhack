# Contributing to openhack

Thanks for your interest in openhack! This project is an AI-powered CTF agent built with TypeScript and ESM. Before jumping in, please read the [README](./README.md) for an overview of the architecture and how things fit together.

## Development Setup

```bash
git clone https://github.com/yaoyue123/openhack.git
cd openhack
npm install
npm run dev
```

That's it. No Docker needed for development, no external services to spin up.

## Available Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run the CLI directly via tsx (no build step) |
| `npm run build` | Build with tsup to `dist/` |
| `npm test` | Run tests with vitest |
| `npm run typecheck` | Check types with `tsc --noEmit` |

Run `npm run typecheck` and `npm test` before opening a PR. Both need to pass.

## Code Style

This project doesn't use a linter or formatter. Instead, follow these conventions by example:

- **Pure ESM.** The project uses `"type": "module"`. All imports use `.js` extensions: `import { foo } from "./bar.js"`.
- **Kebab-case filenames.** `loop-guard.ts`, `budget-guard.ts`, not `loopGuard.ts`.
- **`import type` for types.** Always use `import type { Foo }` when importing only types.
- **Node builtins use `node:` prefix.** `import * as fs from "node:fs/promises"`.
- **Types colocated.** Each module has a `types.ts` with interfaces and a `DEFAULT_*_CONFIG` export.
- **Barrel exports.** Each module has an `index.ts` that re-exports public API.

## Bilingual README Sync

This project maintains both [README.md](./README.md) (English) and [README.zh-CN.md](./README.zh-CN.md) (Chinese). When you update one, update the other to keep content in sync. CI checks that both files have the same number of sections.

## Error Message Convention

Error messages should tell the user three things: what happened, why it happened, and how to fix it.

Good:

```
Config file not found at ~/.config/openhack/openhack.jsonc. Run `openhack init` to create one.
```

Bad:

```
ENOENT: no such file or directory
```

## Pull Request Process

1. Fork the repo
2. Create a branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run `npm run typecheck` and `npm test`
5. Push and open a PR against `master`

### Commit Style

Conventional commits preferred but not enforced:

```
feat(solve): add category hint from directory structure
fix(harness): correct loop detection similarity scoring
docs: update tool table in README
```

### PR Checklist

When opening a PR, you'll see a template. Make sure to fill it out. Key points:

- Tests pass
- Typecheck is clean
- README is updated if you changed user-facing behavior
- Both READMEs are synced if you touched documentation

## Adding Tools

Tools live in `src/tool/`. Use the `defineTool()` factory and register in `src/tool/registry.ts`. Follow the pattern of an existing tool like `bash.ts` or `read.ts`.

## Adding Agents

Agents are defined in `src/agent/types.ts` as entries in the `AGENTS` record. Each agent is a name, system prompt, and category.

## Questions?

Open a [GitHub Discussion](https://github.com/yaoyue123/openhack/discussions) for questions that aren't bugs or feature requests.
