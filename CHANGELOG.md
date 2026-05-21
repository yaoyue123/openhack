# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2025-05-21

### Added

- Initial release of openhack, an AI-powered CTF agent
- Three-layer architecture: Harness (code guards), Memory (persistence), Agent Loop (LLM-driven)
- 13 built-in tools (bash, read, write, edit, glob, grep, webfetch, flag, python, state-read, state-write, memory-query, memory-write)
- CLI commands: init, chat, solve, sessions, resume, skills, config
- Harness guards: LoopGuard, BudgetGuard, Terminator
- Persistent memory system with state, findings, failed-paths, and attack-log files
- Skill system with category-specific expertise (crypto, pwn, web, reverse, forensics, misc, triage)
- MCP server integration for forensics, pwn, web, and reverse categories
- Docker support for isolated challenge execution
- Permission system with allow/deny/ask rules
- Session management with pause and resume
- FSM phase routing: recon, exploit, lateral, escalate, done
- Context compression when token budget runs low
- OpenAI-compatible API backend
- Zod-validated config with JSONC support
- Ink-based TUI REPL
- CI pipeline with typecheck, test, and build across Node 18, 20, 22
- Bilingual documentation (English and Chinese)
