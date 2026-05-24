/**
 * PauseController — manages pause/resume/stop state for the agent loop.
 *
 * The REPL creates this controller and passes it to `runAgentLoop`.
 * The agent loop queries it at each checkpoint (after each outer iteration).
 * When the hard cap (`maxStepsPerRun`) is reached, the loop pauses and
 * awaits user action (continue / redirect / stop).
 *
 * Abort-safe: Ctrl+C during pause rejects the pending promise cleanly.
 * Single deferred: only one pause promise exists at a time, preventing
 * stale resolver race conditions.
 */

export type PauseAction = "continue" | "stop" | { redirect: string };

export interface PauseControllerConfig {
  maxStepsPerRun: number;
  abortSignal?: AbortSignal;
}

export interface PauseControllerState {
  state: "running" | "paused" | "stopped";
  stepsThisRun: number;
  maxSteps: number;
}

export class PauseController {
  private config: PauseControllerConfig;
  private stepsThisRun = 0;
  private _state: "running" | "paused" | "stopped" = "running";
  private deferred: { resolve(action: PauseAction): void } | null = null;
  private onStateChangeFn?: (state: PauseControllerState) => void;

  constructor(config: PauseControllerConfig) {
    this.config = config;
  }

  /** Called by the agent loop after each outer iteration. Returns true if should pause. */
  shouldPause(): boolean {
    this.stepsThisRun++;
    if (this._state === "stopped") return true;
    return this.stepsThisRun >= this.config.maxStepsPerRun;
  }

  /** Called by the agent loop to wait for user action. Rejects on abort. */
  async waitForResume(): Promise<PauseAction> {
    this._state = "paused";
    this.emitStateChange();

    return new Promise<PauseAction>((resolve, reject) => {
      this.deferred = { resolve };

      // Wire abort signal to reject the pause promise
      const onAbort = () => {
        this._state = "stopped";
        this.deferred = null;
        reject(new DOMException("Aborted", "AbortError"));
      };
      this.config.abortSignal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** Called by the agent loop to ask user confirmation for permission "ask" actions */
  async askConfirm(question: string): Promise<boolean> {
    this._state = "paused";
    this.emitStateChange();

    return new Promise<boolean>((resolve, reject) => {
      // Store a special deferred that returns boolean
      const originalDeferred = this.deferred;
      this.deferred = {
        resolve: (action: PauseAction) => {
          resolve(action === "continue");
        },
      };

      const onAbort = () => {
        this._state = "stopped";
        this.deferred = null;
        reject(new DOMException("Aborted", "AbortError"));
      };
      this.config.abortSignal?.addEventListener("abort", onAbort, { once: true });

      // If we had a pending deferred (unlikely), restore it when done
      if (originalDeferred && this._state !== "paused") {
        this.deferred = originalDeferred;
      }
    });
  }

  /** Called by REPL: user presses Enter to continue */
  resume(): void {
    if (this._state !== "paused" || !this.deferred) return;
    this._state = "running";
    this.stepsThisRun = 0; // reset step counter for next run
    this.deferred.resolve("continue");
    this.deferred = null;
    this.emitStateChange();
  }

  /** Called by REPL: user types a message to redirect */
  redirect(message: string): void {
    if (this._state !== "paused" || !this.deferred) return;
    this._state = "running";
    this.stepsThisRun = 0;
    this.deferred.resolve({ redirect: message });
    this.deferred = null;
    this.emitStateChange();
  }

  /** Called by REPL: user presses 's' to stop */
  stop(): void {
    if (this._state !== "paused" || !this.deferred) return;
    this._state = "stopped";
    this.deferred.resolve("stop");
    this.deferred = null;
    this.emitStateChange();
  }

  /** Subscribe to state changes (for StatusBar updates) */
  onStateChange(fn: (state: PauseControllerState) => void): void {
    this.onStateChangeFn = fn;
  }

  /** Get current state snapshot */
  getState(): PauseControllerState {
    return {
      state: this._state,
      stepsThisRun: this.stepsThisRun,
      maxSteps: this.config.maxStepsPerRun,
    };
  }

  /** Reset for a new user message (new run) */
  resetRun(): void {
    this.stepsThisRun = 0;
    this._state = "running";
    this.emitStateChange();
  }

  private emitStateChange(): void {
    this.onStateChangeFn?.(this.getState());
  }
}
