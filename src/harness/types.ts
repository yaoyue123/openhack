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
}

export interface BudgetGuardResult {
  shouldCompress: boolean;
  currentUsage: number;
  action: "continue" | "compress" | "terminate";
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
}

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
  },
  terminator: {
    maxStepsWithoutProgress: 10,
  },
};
