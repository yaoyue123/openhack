# openhack Design Document

> CTF 竞赛 AI Agent — 终端 REPL、TypeScript、Skill + MCP 架构

## 1. 项目定位

**openhack** 是一个面向 CTF 竞赛的安全 Agent，采用 TypeScript 编写，运行在终端 REPL 中。

核心定位：**CTF 比赛中的 AI 队友**。自动分类题目、制定解题策略、调用专业工具、执行攻击，最终拿到 flag。

### 设计原则

- **开箱即用** — 不装 Docker 也能跑基础功能（shell + 文件操作 + web 请求）
- **渐进增强** — 有 Docker → 自动获得完整工具链；装了 skill → 获得领域知识
- **安全可控** — 危险操作（提权攻击、内网扫描）默认 ask 确认
- **可扩展** — 社区可以贡献 skill（markdown 知识）和 MCP server（工具封装）

### 技术栈

| 层 | 选型 |
|---|---|
| 语言 | TypeScript (Node.js) |
| LLM 协议 | OpenAI Chat Completion 兼容 |
| TUI 框架 | ink (React for CLI) 或 blessed |
| MCP 客户端 | @modelcontextprotocol/sdk |
| 容器 | Docker Engine API |
| 配置 | openhack.jsonc (JSON with comments) |

---

## 2. 核心架构

```
┌─────────────────────────────────────────────┐
│                  REPL (TUI)                  │
│            用户输入 ←→ Agent 输出              │
├─────────────────────────────────────────────┤
│              Agent Router                    │
│         triage → web/pwn/rev/crypto/...      │
├──────┬──────┬──────┬──────┬─────────────────┤
│ Skill│  MCP │  内置 │ LLM  │   Session       │
│ Engine│Client│ Tools │ Layer│   Manager       │
├──────┴──────┴──────┴──────┴─────────────────┤
│            Permission System                 │
│         (allow/deny/ask per tool)            │
├─────────────────────────────────────────────┤
│          Runtime Layer                       │
│     裸机执行 ｜ Docker 容器 ｜ 自动检测切换      │
└─────────────────────────────────────────────┘
```

---

## 3. Agent 系统

### Agent 层级

```
triage (调度器)
  ├── web    — Web 安全 (SQLi, XSS, SSTI, SSRF, JWT, 文件上传...)
  ├── pwn    — 二进制利用 (栈溢出, ROP, 堆利用, 格式化字符串...)
  ├── rev    — 逆向工程 (ELF/PE 分析, 自定义 VM, 反混淆...)
  ├── crypto — 密码学 (RSA, AES, ECC, 经典密码...)
  ├── forensics — 取证 (磁盘/内存分析, 隐写, 流量分析...)
  └── misc   — 杂项 (Pyjail, 编码, 沙箱逃逸...)
```

### Agent 配置 Schema

```typescript
interface AgentConfig {
  name: string              // "triage" | "web" | "pwn" | ...
  mode: "primary" | "subagent"
  description: string       // 用于 agent 路由的描述
  permission: PermissionRule[]  // 该 agent 的工具权限
  model?: { modelID: string; providerID: string }  // 可选模型覆盖
  prompt?: string           // 自定义 system prompt 片段
  skills?: string[]         // 默认加载的 skill 列表
}
```

### Triage Agent（调度器）

- **触发**：用户输入题目描述、粘贴 flag 格式、或提交文件路径
- **职责**：
  1. 侦察：检查文件类型、运行 `file` 命令、扫描端口/URL
  2. 分类：根据特征判断题目类别
  3. 委托：将任务转给对应专家 agent，附带侦察摘要
  4. 监督：如果专家卡住，建议切换类别（web 题可能需要 crypto 知识）
- **权限**：只读（bash 只允许 file/curl/nmap 等侦察命令）

### 专家 Agent（web/pwn/rev/crypto/forensics/misc）

- **触发**：由 triage 委托，或用户直接调用 `/web`、`/pwn` 等
- **职责**：
  1. 深度分析：在所属领域内执行详细分析
  2. 解题执行：调用工具编写和执行 exploit
  3. Flag 提取：自动识别 flag 格式
- **权限**：根据类别开放对应工具

### 辅助 Agent

| Agent | 模式 | 用途 |
|---|---|---|
| `report` | subagent | 生成标准化 writeup |
| `help` | subagent | 工具使用指导、题目 hints |

---

## 4. Skill 系统

### Skill 目录结构

```
skills/
├── web/
│   ├── SKILL.md              # Web 攻击策略总纲
│   ├── sql-injection.md
│   ├── xss.md
│   ├── ssti.md
│   ├── ssrf.md
│   ├── jwt-attacks.md
│   └── file-upload.md
├── pwn/
│   ├── SKILL.md
│   ├── buffer-overflow.md
│   ├── rop-chains.md
│   ├── heap-exploitation.md
│   ├── format-string.md
│   └── kernel-exploit.md
├── reverse/
│   ├── SKILL.md
│   ├── elf-analysis.md
│   ├── custom-vm.md
│   └── anti-debug.md
├── crypto/
│   ├── SKILL.md
│   ├── rsa-attacks.md
│   ├── aes-modes.md
│   └── classical-ciphers.md
├── forensics/
│   ├── SKILL.md
│   ├── disk-memory.md
│   ├── steganography.md
│   └── network-analysis.md
└── misc/
    ├── SKILL.md
    ├── pyjail.md
    └── encoding.md
```

### SKILL.md 格式

```yaml
---
name: pwn
description: >
  二进制利用技术。当目标是本地/远程 ELF 二进制文件、
  需要缓冲区溢出、ROP、堆利用时使用。
license: MIT
compatibility: 需要 bash, Python 3, pwntools, gdb, pwndbg/GEF
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch Skill
metadata:
  user-invocable: "true"
  argument-hint: "[binary-path] [target-host:port]"
  category: pwn
  mcp-servers:
    - name: pwn-tools
      command: ["python3", "mcp/pwn-server.py"]
      optional: true
---
```

### Skill 加载流程（Prompt + MCP 动态注册）

```
1. 用户输入 → triage 分类 → 路由到 pwn agent
2. pwn agent 加载 "pwn" skill
   ├── 解析 SKILL.md frontmatter
   ├── 注入 SKILL.md 内容 + 所有子 .md 到 agent context（知识）
   └── 检查 metadata.mcp-servers
       ├── 检测 Docker 可用？
       │   ├── 是 → 在容器中启动 MCP server
       │   └── 否 → 尝试本地启动 MCP server
       ├── 启动成功 → 注册 MCP tools 为 agent 可用工具
       └── 启动失败（optional=true）→ 降级到纯 bash 调用
3. Agent 同时拥有：领域知识（prompt）+ 专业工具（MCP tools）
```

### Skill 来源

| 来源 | 路径 | 优先级 |
|---|---|---|
| 内置 | `openhack/skills/**/SKILL.md` | 最低（可覆盖） |
| 全局用户 | `~/.openhack/skills/**/SKILL.md` | 中 |
| 项目本地 | `./.openhack/skills/**/SKILL.md` | 最高 |
| 远程 | `openhack.jsonc` → `skills.urls` → `index.json` | 按配置 |

---

## 5. MCP Server 示例

```typescript
// mcp/pwn-server.ts — 提供 pwntools 封装
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "checksec",
      description: "检查二进制安全机制 (NX, ASLR, Canary, PIE)",
      inputSchema: { type: "object", properties: {
        binary: { type: "string", description: "二进制文件路径" }
      }, required: ["binary"] }
    },
    {
      name: "disassemble",
      description: "反汇编二进制函数",
      inputSchema: { type: "object", properties: {
        binary: { type: "string" },
        function: { type: "string" },
        arch: { type: "string", enum: ["x86", "x64", "arm"] }
      }, required: ["binary"] }
    },
    {
      name: "run_exploit",
      description: "执行 Python exploit 脚本并返回输出",
      inputSchema: { type: "object", properties: {
        script: { type: "string", description: "Python/pwntools 脚本" },
        timeout: { type: "number", default: 30 }
      }, required: ["script"] }
    }
  ]
}))
```

---

## 6. 权限系统

```typescript
interface PermissionRule {
  tool: string         // 工具名或 "*"
  pattern: string      // 目标匹配模式或 "*"
  action: "allow" | "deny" | "ask"
}
```

### 默认规则示例

```jsonc
{
  "permissions": {
    "default": [
      { "tool": "read", "pattern": "*", "action": "allow" },
      { "tool": "write", "pattern": "/tmp/*", "action": "allow" },
      { "tool": "write", "pattern": "./workspace/*", "action": "allow" },
      { "tool": "bash", "pattern": "file *", "action": "allow" },
      { "tool": "bash", "pattern": "curl *", "action": "allow" },
      { "tool": "bash", "pattern": "python3 *", "action": "allow" },
      { "tool": "bash", "pattern": "rm -rf *", "action": "ask" },
      { "tool": "bash", "pattern": "nmap -sS *", "action": "ask" },
      { "tool": "bash", "pattern": "sqlmap *", "action": "ask" },
      { "tool": "bash", "pattern": "rm -rf /", "action": "deny" },
      { "tool": "*", "pattern": "127.0.0.1:*", "action": "deny" }
    ],
    "ctf-mode": [
      { "tool": "bash", "pattern": "*", "action": "allow" },
      { "tool": "write", "pattern": "*", "action": "allow" }
    ]
  }
}
```

### 权限评估流程

```
工具调用请求
    │
    ▼
合并规则集：default + agent 规则 + skill 规则 + 用户覆盖
    │
    ▼
从后往前匹配（last match wins）
    │
    ├── action=allow → 执行
    ├── action=deny  → 拒绝 + 记录日志
    └── action=ask   → 弹出确认提示
         ├── 用户确认 → 记住选择（本次会话） → 执行
         └── 用户拒绝 → 跳过
```

---

## 7. 运行时层（双模式）

```
            Runtime Detector
    docker info 成功？→ Docker 模式
    失败？→ 裸机模式
                │
    ┌───────────┴───────────┐
    ▼                       ▼
 Docker 模式             裸机模式
┌─────────────┐     ┌─────────────┐
│ openhack-   │     │ 直接调用     │
│ tools 镜像   │     │ 本机工具     │
├─────────────┤     ├─────────────┤
│ ghidra      │     │ file, curl  │
│ gdb+pwndbg  │     │ python3     │
│ pwntools    │     │ (其他用户    │
│ binwalk     │     │  自行安装)   │
│ nmap        │     └─────────────┘
│ sqlmap      │
│ nuclei      │     共同：内置工具始终可用
│ radare2     │     (read, write, edit,
│ ...         │      grep, glob, webfetch)
└─────────────┘
```

### Docker 镜像策略

```
openhack-tools:latest     — 全家桶（~2GB）
openhack-tools:pwn        — 只含 pwn 工具（~800MB）
openhack-tools:web        — 只含 web 工具（~500MB）
openhack-tools:forensics  — 只含取证工具（~600MB）
```

Skill 的 `mcp-servers` 配置指定需要的镜像，运行时按需拉取。

---

## 8. Flag 检测

Agent 输出和工具结果自动扫描 flag 模式：

```typescript
const FLAG_PATTERNS = [
  /flag\{[^}]+\}/gi,
  /HTB\{[^}]+\}/gi,
  /CTF\{[^}]+\}/gi,
  /[a-f0-9]{32}/g,
  /picoCTF\{[^}]+\}/gi,
]
```

匹配到 flag 时：高亮显示 → 自动记录到 session → 可选提交到 CTFd 平台。

---

## 9. 事件系统

```typescript
type HackEvent =
  | { type: "FLAG_FOUND";     flag: string; source: string }
  | { type: "VULN_DISCOVERED"; vuln: string; severity: string; detail: string }
  | { type: "PHASE_CHANGE";   from: string; to: string }
  | { type: "TOOL_EXEC";      tool: string; args: string[]; exitCode: number }
  | { type: "SKILL_LOADED";   skill: string; mcpStarted: boolean }
  | { type: "AGENT_SWITCH";   from: string; to: string; reason: string }
  | { type: "EXPLOIT_RESULT"; success: boolean; output: string }
```

### 解题流程事件流

```
triage agent 启动
  → PHASE_CHANGE(idle → recon)
  → TOOL_EXEC(file, ["chall.bin"])
  → VULN_DISCOVERED("stack buffer overflow", "high", "no canary, NX disabled")
  → PHASE_CHANGE(recon → exploit)
  → AGENT_SWITCH(triage → pwn)
  → SKILL_LOADED(pwn, mcpStarted=true)
  → TOOL_EXEC(run_exploit, ["exploit.py"])
  → FLAG_FOUND("flag{y0u_g0t_m3}", "pwn/run_exploit")
  → PHASE_CHANGE(exploit → done)
```

---

## 10. 会话管理

```typescript
interface Session {
  id: string
  challenge: {
    name?: string
    category?: string
    description?: string
    files: string[]
    target?: string
  }
  timeline: HackEvent[]
  flags: string[]
  notes: {
    credentials: string[]
    vulnerabilities: object[]
    tools_used: string[]
  }
  state: "idle" | "running" | "paused" | "completed" | "error"
  agentHistory: string[]
}
```

会话存储在 `~/.openhack/sessions/` 下，支持断点恢复。

---

## 11. 项目目录结构

```
openhack/
├── src/
│   ├── index.ts                # 入口
│   ├── repl/                   # TUI REPL
│   │   ├── index.ts
│   │   ├── input.ts
│   │   ├── output.ts
│   │   └── theme.ts
│   ├── agent/                  # Agent 系统
│   │   ├── agent.ts            # Agent 定义 & 注册
│   │   ├── router.ts           # triage 路由逻辑
│   │   ├── triage.ts
│   │   ├── web.ts
│   │   ├── pwn.ts
│   │   ├── reverse.ts
│   │   ├── crypto.ts
│   │   ├── forensics.ts
│   │   ├── misc.ts
│   │   └── report.ts
│   ├── skill/                  # Skill 引擎
│   │   ├── loader.ts
│   │   ├── parser.ts
│   │   ├── registry.ts
│   │   └── discovery.ts
│   ├── mcp/                    # MCP 客户端
│   │   ├── client.ts
│   │   ├── transport.ts
│   │   └── lifecycle.ts
│   ├── tool/                   # 内置工具
│   │   ├── registry.ts
│   │   ├── shell.ts
│   │   ├── read.ts
│   │   ├── write.ts
│   │   ├── edit.ts
│   │   ├── glob.ts
│   │   ├── grep.ts
│   │   ├── webfetch.ts
│   │   └── flag.ts
│   ├── permission/             # 权限系统
│   │   ├── evaluate.ts
│   │   └── config.ts
│   ├── runtime/                # 运行时层
│   │   ├── detector.ts
│   │   ├── docker.ts
│   │   └── bare.ts
│   ├── llm/                    # LLM 层
│   │   ├── provider.ts
│   │   ├── stream.ts
│   │   └── context.ts
│   ├── session/                # 会话管理
│   │   ├── store.ts
│   │   └── events.ts
│   └── config/                 # 配置
│       ├── schema.ts
│       └── loader.ts
├── skills/                     # 内置 skills
│   ├── triage/SKILL.md
│   ├── web/SKILL.md
│   │   ├── sql-injection.md
│   │   ├── xss.md
│   │   └── ...
│   ├── pwn/SKILL.md
│   │   ├── buffer-overflow.md
│   │   └── ...
│   ├── reverse/SKILL.md
│   ├── crypto/SKILL.md
│   ├── forensics/SKILL.md
│   └── misc/SKILL.md
├── mcp/                        # 内置 MCP servers
│   ├── pwn-server.ts
│   ├── web-server.ts
│   ├── rev-server.ts
│   └── forensics-server.ts
├── docker/                     # Docker 镜像定义
│   ├── Dockerfile.pwn
│   ├── Dockerfile.web
│   ├── Dockerfile.forensics
│   └── Dockerfile.full
├── package.json
├── tsconfig.json
└── openhack.jsonc              # 默认配置
```

---

## 12. CLI 入口

```bash
openhack                          # 启动 REPL
openhack solve ./challenge.bin    # 直接解题
openhack solve --category pwn ./challenge.bin
openhack sessions                 # 列出历史会话
openhack resume <id>              # 恢复会话
openhack skills list              # 列出可用 skills
openhack skills install <url>     # 安装远程 skill
openhack config                   # 编辑配置
```
