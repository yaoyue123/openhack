# OpenHack

## What This Is

CTF AI agent with a three-layer architecture: Harness (code guards), Memory (persistence), Agent Loop (LLM-driven). TypeScript ESM CLI built with yargs, Vercel AI SDK, Effect (partial), tsup. Published as `@yaoyue123/opensec`.

## Core Value

AI agent that autonomously solves CTF challenges across 7 categories with safety harness and persistent memory.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ CLI framework (init, chat, solve, sessions, resume, skills, config) — v0.0.1
- ✓ Agent loop with streamText + tool dispatch — v0.0.1
- ✓ 7 specialist agents (triage, crypto, pwn, web, reverse, forensics, misc) — v0.0.1
- ✓ 16 built-in tools (shell, read, write, edit, glob, grep, webfetch, flag, python, state, memory, delegate, reflect, git) — v0.0.1
- ✓ Harness safety (LoopGuard, BudgetGuard, Terminator) — v0.0.1
- ✓ Skill system (SKILL.md discovery + companion files) — v0.0.1
- ✓ MCP integration (forensics, pwn, web, rev servers) — v0.0.1
- ✓ Memory persistence (state.md, findings.md, failed-paths.md, attack-log.md) — v0.0.1

### Active

<!-- Current scope. Building toward these. -->

- [ ] Crypto agent can solve simple RSA challenges from .pyc files
- [ ] Crypto agent handles .pyc decompilation across Python versions (3.8-3.13)
- [ ] Post-test retrospective documented with findings
- [ ] Code improvements based on test findings implemented
- [ ] Agent capability upgrades for common CTF crypto patterns

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Non-crypto CTF categories (pwn, web, reverse, forensics) — focus on crypto for this milestone
- Full test suite / CI improvements — testing through real challenge only
- npm publish / release automation — manual as designed

## Current Milestone: v0.1 RSA Crypto Challenge Test & Improvement

**Goal:** Test openhack against a simple RSA .pyc challenge, evaluate performance, reflect, and improve the codebase.

**Target features:**
- Test run with a known-answer RSA challenge (flag: `flag{IlikeCTFbutCTFdon'tlikeme}`)
- Post-test analysis documenting agent behavior, successes, and failures
- Code improvements for .pyc handling, crypto workflow, Windows compatibility
- Capability upgrades for crypto agent prompts and tools

**Challenge details:**
- File: `challenges/简单的rsa/简单的RSA.pyc` (Python 3.10 bytecode)
- Content: hardcoded p, q, e=65537, encrypted c
- Solution: standard RSA decrypt → base64 decode → flag

## Context

- Project is TypeScript ESM, built with tsup, no CJS output
- Python tool executes system Python directly (no sandboxing)
- No crypto MCP server — relies on built-in Python tool + skill reference
- Crypto skill reference is comprehensive (~1,280 lines of RSA attack patterns)
- Windows platform with miniconda Python 3.13 as system Python
- .pyc files require matching Python version for marshal loading

## Constraints

- **Tech stack**: TypeScript ESM, Node.js 18+, Python 3.x for crypto tools
- **Platform**: Windows (primary development environment)
- **Python deps**: pycryptodome, sympy, xdis, gmpy2 must be available for crypto challenges
- **LLM backend**: Requires external LLM (Ollama, OpenAI, or compatible API)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No crypto MCP server | Python libraries are the standard crypto tooling | ✓ Good — simpler architecture |
| Skill-based agent knowledge | SKILL.md files inject domain expertise | ✓ Good — updatable without code changes |
| System Python for crypto | No sandboxing needed for CTF work | ⚠ Revisit — version compatibility issues with .pyc |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-25 after milestone v0.1 initialization*
