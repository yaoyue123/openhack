# openhack

[English](./README.md) | 中文

AI 驱动的 CTF 智能体，具备 Harness 控制层、持久化记忆和技能架构。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/badge/npm-0.0.1-blue.svg)](https://www.npmjs.com/package/openhack)

## 概述

openhack 是一个用于解决 CTF（Capture The Flag）安全挑战的 AI 智能体。它将 LLM 驱动的智能体循环与代码级 Harness（安全边界控制层）相结合，配合跨会话持久化的记忆文件和针对不同类别的技能系统。

智能体遵循五阶段结构化方法论：侦察（recon）、利用（exploit）、横向移动（lateral）、提权（escalate）和完成（done）。它支持多步工具调用，内置无限循环检测、上下文溢出保护和失控执行终止等防护机制。

## 架构

openhack 采用三层架构：

**Harness（控制层）** 是代码边界。它不告诉智能体该怎么思考，只确保不出问题。循环检测捕获重复的工具调用，预算追踪在上下文溢出前进行压缩，终止器在发现 flag 或进度停滞时停止执行。

**Memory（记忆层）** 是持久化层。状态、发现、失败路径和攻击日志存储在 markdown 文件中，智能体通过专用工具读写这些文件。会话可以暂停和恢复而不丢失上下文。

**Agent Loop（智能体循环）** 是 LLM 驱动的核心。它通过 `onStepFinish` 回调迭代运行工具调用，让 Harness 在每次迭代之间执行防护检查。

```
┌──────────────────────────────────────────────┐
│                Harness (代码层)               │
│  ┌───────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ LoopGuard  │ │ Budget   │ │ Terminator  │ │
│  │ (哈希匹配) │ │ (令牌数) │ │ (flag/状态) │ │
│  └─────┬─────┘ └────┬─────┘ └──────┬──────┘ │
│        └─────────┬───┘──────────────┘         │
│                  │ 观察、注入提示              │
│  ┌───────────────▼────────────────────────┐   │
│  │       Agent Loop (自然语言)             │   │
│  │  state.md <-> LLM <-> Tools <-> memory/│   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

## 功能特性

- 多步工具调用的迭代式智能体循环
- FSM 阶段路由：侦察、利用、横向移动、提权、完成
- 令牌预算不足时自动压缩上下文
- 基于哈希相似度匹配的循环检测
- 跨会话持久化记忆（状态、发现、失败路径、攻击日志）
- 技能系统，每个类别配有参考文件
- MCP（Model Context Protocol）服务器集成
- Docker 支持，用于隔离执行挑战
- 权限系统，支持按工具配置 allow/deny/ask 规则
- 会话管理，支持暂停和恢复
- 自动 flag 检测（通过 `flag` 工具）
- 兼容 OpenAI API 的后端（支持 Ollama、LM Studio 等）

## 快速开始

```bash
# 安装
npm install -g openhack

# 初始化配置
openhack init

# 解决一个挑战
openhack solve ./my-challenge

# 或者发送一条消息
openhack chat "如何解码 base64 字符串？"
```

`init` 向导会询问你的 API 地址、密钥和默认模型。默认使用 `http://localhost:11434/v1`（本地 Ollama 实例）。

## 配置

配置文件位于 `~/.config/openhack/openhack.jsonc`（支持注释的 JSON 格式）。

```jsonc
{
  "llm": {
    "baseURL": "http://localhost:11434/v1",
    "model": "default",
    "apiKey": ""
  },
  "agent": {
    "maxSteps": 25,      // 最大工具调用迭代次数
    "timeout": 300       // 超时秒数
  },
  "harness": {
    "loop": {
      "windowSize": 5,             // 比较的步数窗口
      "similarityThreshold": 0.8,  // 0-1 哈希匹配比率
      "maxRepeats": 3              // 连续匹配后停止的次数
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
    "image": null       // 使用默认镜像
  },
  "mcpServers": {},     // 在此添加 MCP 服务器
  "permissions": {
    "default": ["ask"],
    "rules": [
      { "tool": "read", "pattern": "*", "action": "allow" },
      { "tool": "bash", "pattern": "*", "action": "allow" }
    ]
  }
}
```

通过 CLI 管理配置：

```bash
openhack config list            # 打印完整配置
openhack config get llm.model   # 获取某个值
openhack config set agent.maxSteps 50  # 设置某个值
openhack config validate        # 检查问题
```

## CLI 命令

| 命令 | 说明 |
|---|---|
| `openhack init` | 交互式配置向导 |
| `openhack chat <message>` | 向智能体发送消息 |
| `openhack solve [path]` | 自动分析和解决 CTF 挑战 |
| `openhack sessions` | 列出所有会话 |
| `openhack resume <id>` | 恢复暂停的会话 |
| `openhack skills list` | 列出已加载的技能 |
| `openhack config get <key>` | 获取配置值 |
| `openhack config set <key> <value>` | 设置配置值 |
| `openhack config list` | 打印完整配置 |
| `openhack config validate` | 验证配置 |

`solve` 命令接受路由参数：

```bash
openhack solve ./challenge --category crypto
openhack solve ./challenge --agent pwn --model gpt-4
```

## 工具

智能体在执行过程中可以使用 13 个内置工具：

| 工具 | 用途 |
|---|---|
| `bash` | 运行 shell 命令 |
| `read` | 读取文件内容 |
| `write` | 创建或覆盖文件 |
| `edit` | 对文件进行精确字符串替换 |
| `glob` | 按模式查找文件 |
| `grep` | 用正则搜索文件内容 |
| `webfetch` | 从 URL 获取内容 |
| `flag` | 提交发现的 flag |
| `python` | 执行 Python 代码 |
| `state-read` | 读取当前 `state.md` |
| `state-write` | 更新 `state.md`（阶段、目标、发现） |
| `memory-query` | 从记忆文件读取（findings、failed-paths、attack-log） |
| `memory-write` | 写入记忆文件 |

## 架构详情

### Harness 防护机制

**LoopGuard** 对每一步的工具调用和参数进行哈希，然后比较最近 N 步的相似度。如果相似度分数在超过 `maxRepeats` 步连续超过阈值，它会注入提示告诉智能体切换方法。

**BudgetGuard** 跟踪累计令牌使用量。当超过压缩阈值时，触发上下文压缩，对较早的步骤进行摘要，同时保留最近的步骤。

**Terminator** 监控 flag 检测（通过 `flag` 工具）和进度停滞。如果智能体连续 N 步没有有意义的状态变化，它终止循环。

### 记忆系统

记忆文件存放在挑战的 `.openhack/` 目录中：

- `state.md` 跟踪当前阶段、目标和工作发现。智能体在每次重要操作后更新它。
- `memory/findings.md` 存储发现的端口、漏洞、凭证和其他情报。
- `memory/failed-paths.md` 记录无效的方法，防止智能体重复尝试。
- `memory/attack-log.md` 是自动生成的按时间排序的所有操作日志。

**Compressor** 从较早的对话步骤中提取关键信息并替换为摘要，在保持关键上下文的同时控制令牌预算。

## 开发

```bash
# 开发模式运行
npm run dev

# 生产构建
npm run build

# 运行测试
npm test

# 类型检查
npm run typecheck
```

### 技术栈

- TypeScript + ESM 模块
- Vercel AI SDK 用于 LLM 交互
- Effect（部分使用）用于运行时服务
- yargs 用于 CLI
- Zod 用于配置验证
- vitest 用于测试
- tsup 用于构建

## 许可证

[MIT](./LICENSE)
