# 修复计划：OpenHack CTF Agent Solve 失败根因修复

## 目标
修复 `openhack solve` 和 `openhack chat` 无法有效解决 CTF 挑战的 15 个问题，使其能在 Windows 上通过完整 solve 流程找到 flag。

## 阶段总览

| 阶段 | 描述 | 文件 | 优先级 |
|------|------|------|--------|
| 1 | 修复 Python 工具：`python3` → 跨平台 | `src/tool/python.ts` | 🔴 严重 |
| 2 | 修复 Shell 工具：Windows 命令适配 | `src/tool/shell.ts` | 🔴 严重 |
| 3 | 修复 Read 工具：二进制文件支持 | `src/tool/read.ts` | 🔴 严重 |
| 4 | 为 Solve 添加超时/中止信号 | `src/index.ts`, `src/solve.ts` | 🔴 严重 |
| 5 | 统一迭代计数：消除外层 while 循环 | `src/agent-loop.ts` | 🟠 高 |
| 6 | 修复 Session 目录隔离 | `src/agent-loop.ts`, `src/memory/` | 🟠 高 |
| 7 | 更新系统提示 + Agent 提示 | `src/llm/system-prompt.ts`, `src/agent/definitions.ts` | 🟠 高 |
| 8 | Token 估计修复 + Provider 优化 | `src/llm/token-counter.ts`, `src/llm/provider.ts` | 🟡 中 |
| 9 | 验证测试 | e2e solve test | 🔵 验证 |

## 遇到的错误（初始）

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| `python3` 在 Windows 上不存在 | N/A | 添加平台检测，fallback 到 `python` |
| Linux 命令（xxd, strings, head, file）在 Windows 上不存在 | N/A | 添加命令检测，用 PowerShell 替代 |
| `readFile(safePath, "utf-8")` 损坏二进制 .pyc | N/A | 添加二进制检测，hex/base64 fallback |
| Solve 无超时，运行到 HTTP 超时（~600s） | N/A | 添加 AbortController + config.agent.timeout |
| 双层迭代计数导致 200+ 步 | N/A | 移除外层 while，统一用 stopWhen |
| Session 内存路径错误，所有 session 共享 state.md | N/A | 使用 `sessionId` 作为子目录 |
| DeepSeek 模型 token 估计用 `cl100k_base` 不准确 | N/A | 添加 DeepSeek 编码支持 |
| Proxy 重载封装了流迭代器 | N/A | 只封装 `doStream`/`doGenerate` |
| 系统提示未提到 .pyc / xdis 处理 | N/A | 添加相关指导 |
| 加密 Agent 提示太短，无 .pyc 指导 | N/A | 扩展提示内容 |
