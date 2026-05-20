import type { ModelMessage } from "ai";
import {
  type HarnessConfig,
  type LoopGuardResult,
  type BudgetGuardResult,
  type TerminatorResult,
  DEFAULT_HARNESS_CONFIG,
} from "./types.js";
import { LoopGuard } from "./loop-guard.js";
import { BudgetGuard } from "./budget-guard.js";
import { Terminator } from "./terminator.js";

export class Harness {
  public readonly loopGuard: LoopGuard;
  public readonly budgetGuard: BudgetGuard;
  public readonly terminator: Terminator;
  private readonly _config: HarnessConfig;

  constructor(config?: Partial<HarnessConfig>) {
    this._config = {
      loop: { ...DEFAULT_HARNESS_CONFIG.loop, ...config?.loop },
      budget: { ...DEFAULT_HARNESS_CONFIG.budget, ...config?.budget },
      terminator: {
        ...DEFAULT_HARNESS_CONFIG.terminator,
        ...config?.terminator,
      },
    };

    this.loopGuard = new LoopGuard(this._config.loop);
    this.budgetGuard = new BudgetGuard(this._config.budget);
    this.terminator = new Terminator(this._config.terminator);
  }

  get config(): HarnessConfig {
    return this._config;
  }

  checkLoop(messages: ModelMessage[]): LoopGuardResult {
    return this.loopGuard.check(messages);
  }

  checkBudget(messages: ModelMessage[], usageTokens?: number): BudgetGuardResult {
    return this.budgetGuard.check(messages, usageTokens);
  }

  checkTermination(
    messages: ModelMessage[],
    stateContent: string | null,
  ): TerminatorResult {
    return this.terminator.check(messages, stateContent);
  }
}
