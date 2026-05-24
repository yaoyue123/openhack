import { z } from "zod";

// ── Zod Schemas (runtime validation) ──────────────────────────────────────────

export const PermissionActionSchema = z.enum(["allow", "deny", "ask"]);
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

export const LLMConfigSchema = z.object({
  baseURL: z.string().default("http://localhost:11434/v1"),
  model: z.string().default("default"),
  apiKey: z.string().default(""),
  tokenizerModel: z.string().default("gpt-4o"),
});
export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export const PermissionRuleSchema = z.object({
  tool: z.string(),
  pattern: z.string(),
  action: PermissionActionSchema,
});
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;

export const PermissionsConfigSchema = z.object({
  default: z.array(PermissionActionSchema).default(["ask"]),
  rules: z.array(PermissionRuleSchema).default([
    { tool: "read", pattern: "*", action: "allow" },
    { tool: "glob", pattern: "*", action: "allow" },
    { tool: "grep", pattern: "*", action: "allow" },
    { tool: "write", pattern: "*", action: "allow" },
    { tool: "bash", pattern: "*", action: "allow" },
  ]),
});
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
});
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export const DockerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  preferContainer: z.boolean().default(true),
  image: z.string().nullable().optional(),
});
export type DockerConfig = z.infer<typeof DockerConfigSchema>;

export const AgentConfigSchema = z.object({
  maxSteps: z.number().int().positive().default(25),
  timeout: z.number().int().positive().default(300),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const SkillsConfigSchema = z.object({
  maxCompanionBytes: z.number().int().positive().default(15000),
});
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

export const TerminatorConfigSchema = z.object({
  maxStepsWithoutProgress: z.number().int().nonnegative().default(10),
});

export const LoopConfigSchema = z.object({
  windowSize: z.number().int().positive().default(5),
  similarityThreshold: z.number().min(0).max(1).default(0.8),
  maxRepeats: z.number().int().positive().default(3),
});

export const BudgetConfigSchema = z.object({
  maxTokens: z.number().int().positive().default(100000),
  compressThreshold: z.number().int().positive().default(70000),
  preserveRecentSteps: z.number().int().nonnegative().default(5),
  proactiveThreshold: z.number().min(0).max(1).optional().default(0.6),
  tokenizerModel: z.string().optional().default("gpt-4o"),
  maxMessagePairs: z.number().int().positive().optional().default(50),
  minPreservePairs: z.number().int().positive().optional().default(10),
});

export const HarnessConfigSchema = z.object({
  loop: LoopConfigSchema,
  budget: BudgetConfigSchema,
  terminator: TerminatorConfigSchema,
});
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

export const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoLog: z.boolean().default(true),
});
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

export const OpenhackConfigSchema = z.object({
  llm: LLMConfigSchema,
  agent: AgentConfigSchema,
  harness: HarnessConfigSchema,
  memory: MemoryConfigSchema,
  skills: SkillsConfigSchema,
  permissions: PermissionsConfigSchema,
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
  docker: DockerConfigSchema,
});
export type OpenhackConfig = z.infer<typeof OpenhackConfigSchema>;

/**
 * Validate and parse a raw config object against the Zod schema.
 * Throws a readable error on validation failure.
 */
export function parseConfig(raw: unknown): OpenhackConfig {
  const result = OpenhackConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Config validation failed:\n${issues}`);
  }
  return result.data;
}

export const DEFAULT_CONFIG: OpenhackConfig = {
  llm: {
    baseURL: "http://localhost:11434/v1",
    model: "default",
    apiKey: "",
    tokenizerModel: "gpt-4o",
  },
  agent: {
    maxSteps: 25,
    timeout: 300,
  },
  harness: {
    loop: {
      windowSize: 5,
      similarityThreshold: 0.8,
      maxRepeats: 3,
    },
    budget: {
      maxTokens: 100000,
      compressThreshold: 70000,
      preserveRecentSteps: 5,
      proactiveThreshold: 0.6,
      tokenizerModel: "gpt-4o",
      maxMessagePairs: 50,
      minPreservePairs: 10,
    },
    terminator: {
      maxStepsWithoutProgress: 10,
    },
  },
  memory: {
    enabled: true,
    autoLog: true,
  },
  skills: {
    maxCompanionBytes: 15000,
  },
  permissions: {
    default: ["ask"],
    rules: [
      { tool: "read", pattern: "*", action: "allow" },
      { tool: "glob", pattern: "*", action: "allow" },
      { tool: "grep", pattern: "*", action: "allow" },
      { tool: "write", pattern: "*", action: "allow" },
      { tool: "bash", pattern: "*", action: "allow" },
    ],
  },
  mcpServers: {},
  docker: {
    enabled: true,
    preferContainer: true,
  },
};
