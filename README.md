# openhack

English | [中文](./README.zh-CN.md)

AI-powered CTF agent with a Harness control layer, persistent memory, and skill-based architecture.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/badge/npm-0.0.1-blue.svg)](https://www.npmjs.com/package/openhack)

## Overview

openhack is an AI agent that solves CTF (Capture The Flag) security challenges. It combines an LLM-driven agent loop with a code-level Harness that enforces safety boundaries, persistent memory files that survive across sessions, and a skill system for category-specific expertise.

The agent follows a structured methodology across five phases: recon, exploit, lateral, escalate, and done. It supports multi-step tool calling with built-in guards against infinite loops, context overflow, and runaway execution.

## Architecture

openhack uses a three-layer architecture:

**Harness** is the code boundary. It doesn't tell the agent what to think, it just keeps things from breaking. Loop detection catches repeated tool calls, budget tracking compresses context before it overflows, and the terminator stops execution when the flag is found or progress stalls.

**Memory** is the persistence layer. State, findings, failed paths, and attack logs live in markdown files the agent reads and writes through dedicated tools. Sessions can be paused and resumed without losing context.

**Agent Loop** is the LLM-driven core. It runs tool calls iteratively with an `onStepFinish` callback that lets the Harness run per-step guard checks between iterations.

```
┌──────────────────────────────────────────────┐
│                Harness (code)                 │
│  ┌───────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ LoopGuard  │ │ Budget   │ │ Terminator  │ │
│  │ (hashing)  │ │ (tokens) │ │ (flag/state)│ │
│  └─────┬─────┘ └────┬─────┘ └──────┬──────┘ │
│        └─────────┬───┘──────────────┘         │
│                  │ observe, inject hints      │
│  ┌───────────────▼────────────────────────┐   │
│  │         Agent Loop (natural language)  │   │
│  │  state.md <-> LLM <-> Tools <-> memory/│   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

## Features

- Multi-step tool calling with iterative agent loop
- FSM phase routing: recon, exploit, lateral, escalate, done
- Context compression when token budget runs low
- Loop detection via hash-based similarity matching
- Persistent memory across sessions (state, findings, failed paths, attack log)
- Skill system with companion reference files per category
- MCP (Model Context Protocol) server integration
- Docker support for isolated challenge execution
- Permission system with allow/deny/ask rules per tool
- Session management with pause and resume
- Auto flag detection with `flag` tool
- OpenAI-compatible API backend (works with Ollama, LM Studio, etc.)

## Quick Start

```bash
# Install
npm install -g openhack

# Initialize configuration
openhack init

# Solve a challenge
openhack solve ./my-challenge

# Or send a quick message
openhack chat "How do I decode a base64 string?"
```

The `init` wizard will ask for your API base URL, key, and default model. It defaults to `http://localhost:11434/v1` for local Ollama instances.

## Configuration

Config lives at `~/.config/openhack/openhack.jsonc` (JSON with comments supported).

```jsonc
{
  "llm": {
    "baseURL": "http://localhost:11434/v1",
    "model": "default",
    "apiKey": ""
  },
  "agent": {
    "maxSteps": 25,      // max tool-call iterations
    "timeout": 300       // seconds
  },
  "harness": {
    "loop": {
      "windowSize": 5,             // steps to compare
      "similarityThreshold": 0.8,  // 0-1 hash match ratio
      "maxRepeats": 3              // consecutive matches before halt
    },
    "budget": {
      "maxTokens": 100000,
      "compressThreshold": 70000,
      "preserveRecentSteps": 5
    },
    "terminator": {
      "maxStepsWithoutProgress": 10
    }
  },
  "memory": {
    "enabled": true,
    "autoLog": true
  },
  "docker": {
    "enabled": true,
    "preferContainer": true,
    "image": null       // uses default
  },
  "mcpServers": {},     // add MCP servers here
  "permissions": {
    "default": ["ask"],
    "rules": [
      { "tool": "read", "pattern": "*", "action": "allow" },
      { "tool": "bash", "pattern": "*", "action": "allow" }
    ]
  }
}
```

Manage config from the CLI:

```bash
openhack config list            # print full config
openhack config get llm.model   # get a value
openhack config set agent.maxSteps 50  # set a value
openhack config validate        # check for issues
```

## CLI Commands

| Command | Description |
|---|---|
| `openhack init` | Interactive configuration wizard |
| `openhack chat <message>` | Send a message to the agent |
| `openhack solve [path]` | Auto-triage and solve a CTF challenge |
| `openhack sessions` | List all sessions |
| `openhack resume <id>` | Resume a paused session |
| `openhack skills list` | List loaded skills |
| `openhack config get <key>` | Get a config value |
| `openhack config set <key> <value>` | Set a config value |
| `openhack config list` | Print full configuration |
| `openhack config validate` | Validate configuration |

The `solve` command accepts flags for routing:

```bash
openhack solve ./challenge --category crypto
openhack solve ./challenge --agent pwn --model gpt-4
```

## Tools

The agent has 13 built-in tools available during execution:

| Tool | Purpose |
|---|---|
| `bash` | Run shell commands |
| `read` | Read file contents |
| `write` | Create or overwrite files |
| `edit` | Apply targeted string replacements to files |
| `glob` | Find files by pattern |
| `grep` | Search file contents with regex |
| `webfetch` | Fetch content from a URL |
| `flag` | Submit a discovered flag |
| `python` | Execute Python code |
| `state-read` | Read the current `state.md` |
| `state-write` | Update `state.md` (phase, objective, findings) |
| `memory-query` | Read from memory files (findings, failed-paths, attack-log) |
| `memory-write` | Write to memory files |

## Architecture Details

### Harness Guards

**LoopGuard** hashes each step's tool calls and arguments, then compares the last N steps for similarity. If the similarity score exceeds the threshold for more than `maxRepeats` consecutive steps, it injects a prompt telling the agent to switch approaches.

**BudgetGuard** tracks cumulative token usage. When it crosses the compression threshold, it triggers context compression that summarizes older steps while preserving the most recent ones.

**Terminator** watches for flag detection (via the `flag` tool) and progress stalls. If the agent goes N steps without meaningful state changes, it terminates the loop.

### Memory System

Memory files live in the challenge's `.openhack/` directory:

- `state.md` tracks current phase, objective, and working findings. The agent updates it after every significant action.
- `memory/findings.md` stores discovered ports, vulnerabilities, credentials, and other intel.
- `memory/failed-paths.md` records approaches that didn't work, preventing the agent from repeating them.
- `memory/attack-log.md` is the auto-generated chronological log of all actions taken.

The **Compressor** extracts key information from older conversation steps and replaces them with a summary, keeping the token budget under control while preserving critical context.

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

### Tech Stack

- TypeScript with ESM modules
- Vercel AI SDK for LLM interaction
- Effect (partial) for runtime services
- yargs for CLI
- Zod for config validation
- vitest for testing
- tsup for builds

## License

[MIT](./LICENSE)
