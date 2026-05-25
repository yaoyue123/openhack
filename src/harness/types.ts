export interface LoopGuardConfig {
  windowSize: number;
  similarityThreshold: number;
  maxRepeats: number;
}

export interface LoopGuardResult {
  isLoop: boolean;
  repeatCount: number;
  suggestion?: string;
}

export interface BudgetConfig {
  maxTokens: number;
  compressThreshold: number;
  preserveRecentSteps: number;
  /** Trigger compression proactively when usage exceeds this fraction of maxTokens (0-1). 0 disables. */
  proactiveThreshold?: number;
  /** Model name to use for tiktoken tokenization (e.g. "gpt-4o"). Used by token-counter for accurate estimation. */
  tokenizerModel?: string;
  /** Max user/assistant message pairs before sliding window trim kicks in. */
  maxMessagePairs?: number;
  /** Minimum message pairs to preserve after sliding window trim. */
  minPreservePairs?: number;
}

export interface BudgetGuardResult {
  shouldCompress: boolean;
  currentUsage: number;
  action: "continue" | "proactive" | "compress" | "terminate";
}

export interface TerminatorConfig {
  maxStepsWithoutProgress: number;
}

export interface TerminatorResult {
  shouldTerminate: boolean;
  reason?: "flag_found" | "no_progress" | "budget_exhausted" | "agent_declared_done";
}

export interface HarnessConfig {
  loop: LoopGuardConfig;
  budget: BudgetConfig;
  terminator: TerminatorConfig;
  response?: Partial<ResponseGuardConfig>;
}

export interface ResponseGuardConfig {
  windowSize: number;
  maxIdenticalOutputs: number;
}

export interface ResponseGuardResult {
  isStuck: boolean;
  suggestion?: string;
}

export const DEFAULT_RESPONSE_GUARD_CONFIG: ResponseGuardConfig = {
  windowSize: 8,
  maxIdenticalOutputs: 3,
};

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
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
};
