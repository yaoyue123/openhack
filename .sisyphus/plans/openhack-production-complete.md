# OpenHack 生产级完整实现计划

> **For agentic workers:** 使用 `superpowers/subagent-driven-development` 执行此计划。步骤使用 `- [ ]` 复选框跟踪进度。

**目标:** 将 OpenHack CTF AI Agent 从原型阶段提升到生产就绪状态，修复所有不完整的实现、安全漏洞和缺失的功能。

**架构:** 三层架构 (Harness 安全层 → Memory 持久化层 → Agent Loop LLM 驱动层)。修复集中在：安全加固、工具完善、功能补全、代码质量提升。

**技术栈:** TypeScript ESM, yargs CLI, Vercel AI SDK, Effect (partial), tsup, vitest

---

## Phase 0: 准备工作

### Task 0.1: 建立开发基础设施

**文件:**
- 新建: `.editorconfig` (已存在)
- 修改: `.gitignore`
- 修改: `package.json` (补充缺失的脚本)

- [ ] **Step 1: 检查当前项目状态**

运行:
```bash
cd C:\Users\a402-3\Desktop\测试\openhack
git status
git log --oneline -5
npm test 2>&1
npm run typecheck 2>&1
```
记录当前构建状态。

- [ ] **Step 2: 修复 package.json 缺失的依赖**

检查并添加缺失的依赖声明（如 `better-sqlite3` 类型引用但包缺失）。

- [ ] **Step 3: 配置 ESLint 和 Prettier**

```bash
npm init @eslint/config
npm install --save-dev prettier eslint-config-prettier
```

---

## Phase 1: 安全加固 (Security Hardening)

### Task 1.1: 工具路径遍历防护

**文件:**
- 修改: `src/tool/read.ts`
- 修改: `src/tool/write.ts`
- 修改: `src/tool/edit.ts`
- 修改: `src/tool/types.ts` (添加安全配置)
- 新建: `src/tool/security.ts` (路径验证工具函数)

- [ ] **Step 1: 创建路径安全模块**

创建 `src/tool/security.ts`:
```typescript
import * as path from "node:path";
import * as fs from "node:fs";

// 项目允许访问的根目录
export function resolveSecurePath(
  userPath: string,
  allowedBase: string,
): string {
  const resolved = path.resolve(allowedBase, userPath);
  // 确保解析后的路径仍在允许的目录内
  if (!resolved.startsWith(path.resolve(allowedBase))) {
    throw new Error(`Path traversal detected: ${userPath}`);
  }
  return resolved;
}
```

- [ ] **Step 2: 修改 ReadTool 使用路径安全函数**

在 `src/tool/read.ts` 的 `execute` 中:
```typescript
const safePath = resolveSecurePath(args.filePath, ctx.workingDir);
const content = await readFile(safePath, "utf-8");
```

- [ ] **Step 3: 修改 WriteTool 使用路径安全函数**

在 `src/tool/write.ts` 的 `execute` 中添加路径验证。

- [ ] **Step 4: 修改 EditTool 使用路径安全函数**

在 `src/tool/edit.ts` 的 `execute` 中使用 `resolveSecurePath`。

- [ ] **Step 5: 验证所有改动**

运行:
```bash
npm run typecheck
```

---

### Task 1.2: Shell 和 Python 工具命令安全

**文件:**
- 修改: `src/tool/shell.ts`
- 修改: `src/tool/python.ts`

- [ ] **Step 1: ShellTool 添加黑名单机制**

在 `src/tool/shell.ts` 的 `execute` 中:
```typescript
const BLOCKED_COMMANDS = [
  "rm -rf /", "dd if=", "mkfs", "fdisk",
  ":(){ :|:& };:", // fork bomb
  "chmod 777 /", "> /dev/sda",
];

function isCommandAllowed(command: string): boolean {
  const lower = command.toLowerCase();
  return !BLOCKED_COMMANDS.some(banned => lower.includes(banned));
}

// execute中:
if (!isCommandAllowed(args.command)) {
  return { output: "Blocked dangerous command", error: true };
}
```

- [ ] **Step 2: PythonTool 添加代码安全检查**

在 `src/tool/python.ts` 中添加基本的安全过滤（如禁止 `os.system("rm -rf")` 等破坏性操作）。

- [ ] **Step 3: 验证类型检查**

```bash
npm run typecheck
```

---

### Task 1.3: 权限检查系统接入

**文件:**
- 修改: `src/tool/shell.ts`
- 修改: `src/tool/read.ts`
- 修改: `src/tool/write.ts`
- 修改: `src/tool/edit.ts`
- 修改: `src/tool/python.ts`
- 修改: `src/tool/glob.ts`
- 修改: `src/tool/grep.ts`
- 修改: `src/tool/webfetch.ts`

- [ ] **Step 1: 所有工具接入 permissionCheck**

在 `src/tool/shell.ts`、`read.ts`、`write.ts`、`edit.ts`、`python.ts` 的 `execute` 中添加:
```typescript
if (ctx.permissionCheck) {
  const allowed = await ctx.permissionCheck(tool.id, target);
  if (!allowed) {
    return { output: `Permission denied for ${tool.id}`, error: true };
  }
}
```

- [ ] **Step 2: glob、grep、webfetch 接入权限检查**

同样添加 `permissionCheck` 调用。

- [ ] **Step 3: 验证**

```bash
npm run typecheck
npm test
```

---

## Phase 2: 核心功能完善

### Task 2.1: CLI 命令完善

**文件:**
- 修改: `src/index.ts`

- [ ] **Step 1: 添加 session delete 命令**

在 `src/index.ts` 的 yargs 命令链中添加:
```typescript
.command(
  "session delete <id>",
  "Delete a session",
  () => {},
  async (args) => {
    await SessionStore.delete(args.id as string);
    console.log(`Deleted session: ${args.id}`);
  },
)
```

- [ ] **Step 2: 完善 chat 命令**

`chat` 命令当前没有使用 `MemoryManager` 和 `SkillRegistry`。添加:
```typescript
const skillRegistry = await SkillRegistry.create(process.cwd());
const memoryDir = path.join(os.homedir(), ".openhack", "sessions");
const memoryManager = new MemoryManager(memoryDir);
```

- [ ] **Step 3: 添加 config reset 命令**

添加恢复默认配置的命令。

- [ ] **Step 4: 添加版本查看命令**

添加 `--version` 标志或 `version` 命令。

- [ ] **Step 5: 验证**

```bash
npm run typecheck
```

---

### Task 2.2: Session Store 完善

**文件:**
- 修改: `src/session/store.ts`

- [ ] **Step 1: 添加 delete 方法**

```typescript
async delete(id: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(SESSION_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: 添加 get 方法（单个查询）**

```typescript
async get(id: string): Promise<Session | null> {
  return this.load(id);
}
```

- [ ] **Step 3: 验证**

```bash
npm run typecheck
```

---

### Task 2.3: Agent Loop 错误处理完善

**文件:**
- 修改: `src/agent-loop.ts`

- [ ] **Step 1: 重构 onStepFinish 回调**

将现在的混合逻辑拆分为独立的私有方法:
```typescript
private async handleLoopDetection(messages, harness, memory) { ... }
private async handleBudgetCheck(messages, harness, memory) { ... }
private async handleTerminationCheck(messages, stateContent) { ... }
```

- [ ] **Step 2: 添加 fallback 模型支持**

当主 LLM 调用失败时自动切换到 fallback 模型（如果配置了）。

- [ ] **Step 3: 添加完善的重试逻辑**

在 `streamText` 调用周围添加重试，使用指数退避。

- [ ] **Step 4: 验证**

```bash
npm run typecheck
```

---

### Task 2.4: Memory 系统完善

**文件:**
- 修改: `src/memory/compressor.ts`
- 修改: `src/memory/memory-store.ts`
- 新建: `src/memory/cleanup.ts`

- [ ] **Step 1: 改进压缩器**

当前压缩器只是简单的文本提取。添加更好的结构化压缩:
- 保留关键flag发现
- 保留当前的phase状态
- 保留最近的N轮交互
- 对旧的tool调用生成摘要

- [ ] **Step 2: 添加内存清理机制**

创建 `src/memory/cleanup.ts`:
```typescript
export async function cleanupOldSessions(maxAgeDays: number = 30): Promise<number> {
  // 删除超过 maxAgeDays 的 session 目录
}
```

- [ ] **Step 3: 改进错误处理**

将 silent catch 块替换为至少 logging:
```typescript
try {
  // ...
} catch (err) {
  console.error(`[memory] Failed to ${operation}: ${err}`);
}
```

- [ ] **Step 4: 验证**

```bash
npm run typecheck
```

---

### Task 2.5: State File 完善

**文件:**
- 修改: `src/memory/state-file.ts`

- [ ] **Step 1: 修复 parsePhase 正则**

当前正则 `^##\s*Phase\s*\n\s*(\w+)` 要求 Phase 后紧接换行，但模板中是 `## Phase\nrecon`。确保模板和解析逻辑匹配。

- [ ] **Step 2: 添加阶段转换验证**

添加合法阶段列表和转换规则:
- recon → exploit → lateral → escalate → done

- [ ] **Step 3: 验证**

```bash
npm run typecheck
```

---

### Task 2.6: Tool 功能补充

**文件:**
- 修改: `src/tool/webfetch.ts`
- 修改: `src/tool/glob.ts`

- [ ] **Step 1: 完善 webfetch.ts**

```typescript
// 添加:
// - 超时控制 (默认10秒)
// - 响应大小限制 (默认1MB)
// - User-Agent 头
// - 错误处理 (HTTP 4xx/5xx)
```

- [ ] **Step 2: 完善 glob.ts**

确保 glob 工具使用 `ctx.workingDir` 作为基准路径。

- [ ] **Step 3: 验证**

```bash
npm run typecheck
```

---

## Phase 3: 测试覆盖

### Task 3.1: 核心模块测试

**文件:**
- 新建: `src/tool/__tests__/security.test.ts`
- 新建: `src/harness/__tests__/loop-guard.test.ts`
- 新建: `src/harness/__tests__/budget-guard.test.ts`
- 新建: `src/harness/__tests__/terminator.test.ts`
- 新建: `src/memory/__tests__/compressor.test.ts`
- 新建: `src/memory/__tests__/state-file.test.ts`

- [ ] **Step 1: 安全模块测试**

测试路径遍历防护、命令黑名单、权限检查。

- [ ] **Step 2: Harness 测试**

LoopGuard: 测试相似度计算、循环检测、窗口管理
BudgetGuard: 测试 token 估算、压缩阈值、proactive 触发
Terminator: 测试 flag 检测、phase 转换、stall 检测

- [ ] **Step 3: Memory 测试**

测试 state 文件的读写、compressor 的压缩逻辑。

- [ ] **Step 4: 验证**

```bash
npm test
```

---

## Phase 4: MCP 服务器完善

### Task 4.1: MCP 服务器健壮性

**文件:**
- 修改: `src/mcp/forensics-server.ts`
- 修改: `src/mcp/pwn-server.ts`
- 修改: `src/mcp/rev-server.ts`
- 修改: `src/mcp/web-server.ts`
- 修改: `src/mcp/lifecycle.ts`

- [ ] **Step 1: 添加工具可用性检查**

在每个 MCP 服务器中添加启动时检查，确认所需的系统工具是否存在。

- [ ] **Step 2: 添加优雅降级**

当系统工具缺失时，返回清晰的错误消息而不是崩溃。

- [ ] **Step 3: 完善错误消息**

确保所有错误消息都包含可操作的建议（例如 "binwalk not found. Install with: apt-get install binwalk"）。

- [ ] **Step 4: 验证**

```bash
npm run typecheck
```

---

## Phase 5: 代码质量提升

### Task 5.1: 类型安全

**文件:**
- 修改: `src/agent-loop.ts`
- 修改: `src/harness/budget-guard.ts`
- 修改: `src/harness/terminator.ts`
- 修改: `src/llm/provider.ts`
- 修改: `src/memory/compressor.ts`
- 修改: `src/mcp/client.ts`

- [ ] **Step 1: 消除 `as any` 用法**

将所有 `as any` 替换为正确的类型断言或类型保护函数。

- [ ] **Step 2: 消除 `as Record<string, unknown>`**

使用具名类型或泛型约束。

- [ ] **Step 3: 验证**

```bash
npm run typecheck
# 手动检查没有 any 类型警告
```

---

### Task 5.2: 代码一致性

**文件:**
- 修改: `src/harness/loop-guard.ts` (硬编码中文消息)

- [ ] **Step 1: 修复硬编码语言不一致**

`src/harness/loop-guard.ts` 第127行:
```
"你似乎在重复相同的操作。请尝试完全不同的方法。"
```
改为英文:
```
suggestion: isLoop ? "You appear to be repeating the same approach. Try a completely different method." : undefined,
```

- [ ] **Step 2: 统一错误处理模式**

确保所有工具使用 `{ output, error: true }` 模式，不 throw。

- [ ] **Step 3: 修复不一致的 catch 块**

将所有空的 catch 块添加至少 logging。

- [ ] **Step 4: 验证**

```bash
npm run typecheck
```

---

## Phase 6: Config 系统完善

### Task 6.1: Config Loader 完善

**文件:**
- 修改: `src/config/loader.ts`
- 修改: `src/config/schema.ts`

- [ ] **Step 1: 修复 save() 保持 JSONC 注释**

当前 `save()` 使用 `JSON.stringify` 重写整个文件。更好的方案是只在内存中修改对应键值对，保留文件格式。

- [ ] **Step 2: 添加配置迁移**

添加版本化配置支持，当 schema 变更时自动迁移旧配置。

- [ ] **Step 3: 验证**

```bash
npm run typecheck
```

---

## Phase 7: 集成测试和验收

### Task 7.1: 端到端验证

- [ ] **Step 1: 全量类型检查**

```bash
npm run typecheck
```

- [ ] **Step 2: 运行所有测试**

```bash
npm test
```

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

- [ ] **Step 4: CLI 冒烟测试**

```bash
npx tsx src/index.ts --help
npx tsx src/index.ts config validate
npx tsx src/index.ts sessions
```

### Task 7.2: 代码审查

- [ ] **Step 1: 审查所有改动**

确认没有引入回归，所有代码变更符合项目约定。

- [ ] **Step 2: 提交变更**

```bash
git add -A
git commit -m "fix: production-ready improvements across all modules"
```
