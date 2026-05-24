# 根因分析发现

## 🔴 严重问题（4个）

### F1: `python.ts` 使用 `python3` —— Windows 上完全失效
- **文件：** `src/tool/python.ts:35`
- **代码：** `execa("python3", ["-c", args.code], ...)`
- **验证：** `python3 --version` → 无输出；`python --version` → Python 3.13.5
- **影响：** 所有 Python 代码执行失败。密码学分析、解密脚本全部不可用。
- **修复方案：** 平台检测 + fallback：
  ```typescript
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  ```
  或者尝试 `python` 再 fallback 到 `python3`。

### F2: `shell.ts` Windows 上无 Linux 命令
- **文件：** `src/tool/shell.ts:31`
- **代码：** `execa(args.command, { shell: true, ... })` - 使用 cmd.exe
- **系统提示告诉 agent 使用：** `strings`, `head`, `file`, `xxd`, `objdump`, `tshark`, `binwalk`
- **验证：** `head`, `tail`, `xxd`, `strings`, `file`, `od` → 全都不存在
- **影响：** Agent 被告知使用不存在的命令。工具执行返回空/错误。
- **修复方案：**
  - 改系统提示为跨平台友好的命令（`findstr` 替代 `strings`，Python 替代 `xxd` 等）
  - 或添加命令存在性检查 `where.exe` + 友好报错

### F3: `read.ts` 用 `utf-8` 读取二进制文件
- **文件：** `src/tool/read.ts:31`
- **代码：** `readFile(safePath, "utf-8")`
- **影响：** 读取 .pyc / ELF / 图片等二进制文件返回乱码
- **修复方案：** 检测文件是否为二进制（检查 null bytes），如果是则返回 hex dump
  - 前 1024 字节检查是否有 `\0`
  - 是二进制 → 返回 `xxd` 等效格式（hex + ASCII）

### F4: Solve 命令无超时/中止信号
- **文件：** `src/index.ts:194-211` + `src/solve.ts`
- **代码：** `runSolve()` 直接调用，无 AbortController
- **影响：** `config.agent.timeout`（300s 默认）从未使用；solve 跑到 HTTP 超时（~600s）
- **修复方案：**
  ```typescript
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), (config.agent.timeout || 300) * 1000);
  ```
  传入 `runSolve` → `runAgent` → `runAgentLoop`

## 🟠 高优先级问题（5个）

### F5: 双层迭代计数导致步骤膨胀
- **文件：** `src/agent-loop.ts:230, 247, 249`
- **机制：**
  1. 外层 `while` 循环（line 230）控制 `maxIterations`
  2. `stopWhen: stepCountIs(Math.min(maxIterations - iteration, 10))`（line 247）内部也限制
  3. `onStepFinish`（line 249）同时为两个循环增加计数
  4. streamText 停止后外层重新调用，**消息累积**
- **影响：** 实际可执行 maxIterations × 10 步（200+ 步）
- **修复方案：**
  - 选项 A：移除外层 `while` 循环，让 `stopWhen` 处理所有步骤
  - 选项 B：移除 `stopWhen`，让外层 `while` 控制所有步骤
  - 推荐使用 `runLoop` API（AI SDK v4.0.185 中的 `runToolsLoop`）或只用 `stopWhen`

### F6: Session 内存路径错误
- **文件：** `src/agent-loop.ts:119-121`
- **代码：** `sessionDir = join(os.homedir(), ".openhack", "sessions")`
- **影响：** 所有 session 共享同 `state.md`+`memory/`，互相污染
- **修复方案：** 使用 `sessionId` 作为子目录：
  ```typescript
  const sessionDir = path.join(os.homedir(), ".openhack", "sessions", sessionId);
  ```

### F7: Agent 提示不足 - 无 .pyc/xdis 指导
- **文件：** `src/llm/system-prompt.ts:40-41` + `src/agent/definitions.ts:30-34`
- **问题：**
  - 系统提示仅提 "crypto: Python for decryption"，无 .pyc/xdis 处理指导
  - Crypto agent 提示仅 5 行，无实用步骤
  - 系统提示的 Linux 命令假设不适合 Windows
- **修复方案：**
  - 添加 .pyc 处理流程（`xdis` → 提取常量 → 用 Python 解密）
  - 扩展 Crypto agent 提示
  - 替换 Linux-only 命令为跨平台方案

### F8: BUILTIN_AGENTS 中 crypto agent 没有 mcpServers
- **文件：** `src/agent/definitions.ts:100-107`
- **对比：** web/pwn/reverse/forensics 都有 mcpServers，crypto 没有
- **这不一定是 bug，但需要注意**

### F9: solve 完成时 session 状态不更新
- **文件：** `src/solve.ts:158-160`
- **问题：** session 在异常退出时保持 "running" 状态
- **需要更好的错误处理**

## 🟡 中优先级问题（4个）

### F10: Token 估计使用 DeepSeek 的错误编码
- **文件：** `src/llm/token-counter.ts:34`
- **修复：** 添加 DeepSeek 模型识别，用 `o200k_base` 替代 `cl100k_base`

### F11: Proxy 重载封装了所有方法
- **文件：** `src/llm/provider.ts:105-115`
- **修复：** 只封装 `doStream` 和 `doGenerate`

### F12: `buildSystemPrompt()` 每次迭代都做 I/O
- **文件：** `src/agent-loop.ts:147-162`
- **修复：** 添加缓存/dirty 标志，减少文件读取

### F13: 回退模型调用无重试
- **文件：** `src/llm/provider.ts:133-138`
- **修复：** 回退调用也包裹 withRetry

## 🟢 低优先级/观察

### F14: 所有 session 显示 "running" 状态
- 异常退出不会触发 session 状态更新
- 可以优化 try/catch/finally

### F15: 已安装工具可用
- `pycryptodome` ✓, `sympy` ✓, `xdis` ✓, `uncompyle6` ✓
- 如果 python 工具能正常工作，这些库都可用
