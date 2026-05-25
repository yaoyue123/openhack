import type { ModelMessage } from "ai";
import {
  type HarnessConfig,
  type LoopGuardResult,
  type BudgetGuardResult,
  type TerminatorResult,
  type ResponseGuardResult,
  DEFAULT_HARNESS_CONFIG,
  DEFAULT_RESPONSE_GUARD_CONFIG,
} from "./types.js";
import { LoopGuard } from "./loop-guard.js";
import { BudgetGuard } from "./budget-guard.js";
import { Terminator } from "./terminator.js";
import { ResponseGuard } from "./response-guard.js";
import { PlanGuard, type PlanGuardResult } from "./plan-guard.js";
import { ValueExtractor, type ExtractedValue } from "./value-extractor.js";

export class Harness {
  public readonly loopGuard: LoopGuard;
  public readonly budgetGuard: BudgetGuard;
  public readonly terminator: Terminator;
  public readonly responseGuard: ResponseGuard;
  public readonly planGuard: PlanGuard;
  public readonly valueExtractor: ValueExtractor;
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
    this.responseGuard = new ResponseGuard({
      ...DEFAULT_RESPONSE_GUARD_CONFIG,
      ...config?.response,
    });
    this.planGuard = new PlanGuard();
    this.valueExtractor = new ValueExtractor();
  }

  get config(): HarnessConfig {
    return this._config;
  }

  checkLoop(messages: ModelMessage[], failedPaths?: string | null, findings?: string | null): LoopGuardResult {
    return this.loopGuard.check(messages, failedPaths, findings);
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

  checkResponse(toolId: string, output: string): ResponseGuardResult {
    return this.responseGuard.check(toolId, output);
  }

  checkPlan(messages: ModelMessage[], planContent: string | null): PlanGuardResult {
    return this.planGuard.check(messages, planContent);
  }

  extractValues(toolId: string, args: Record<string, unknown>, output: string): ExtractedValue[] {
    return this.valueExtractor.extract(toolId, args, output);
  }
}
