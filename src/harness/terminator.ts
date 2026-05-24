import type { ModelMessage } from "ai";
import type { TerminatorConfig, TerminatorResult } from "./types.js";

const FLAG_PATTERN = /(flag|HTB|CTF|picoCTF|csawctf)\{[^}]+\}/gi;
const PHASE_PATTERN = /^##\s*Phase\s*\n\s*(\w+)/mi;

export class Terminator {
  private readonly config: TerminatorConfig;
  private previousPhase: string | null = null;
  private stepsWithoutPhaseChange: number = 0;

  constructor(config: TerminatorConfig) {
    this.config = config;
  }

  check(
    messages: ModelMessage[],
    stateContent: string | null,
  ): TerminatorResult {
    // 1. Check state.md phase transitions for stall detection
    if (stateContent) {
      const phaseMatch = PHASE_PATTERN.exec(stateContent);
      if (phaseMatch) {
        const currentPhase = phaseMatch[1].toLowerCase();

        // Phase "done" → immediate termination
        if (currentPhase === "done") {
          return { shouldTerminate: true, reason: "agent_declared_done" };
        }

        // Track phase changes for stall detection
        if (this.previousPhase !== null && currentPhase === this.previousPhase) {
          this.stepsWithoutPhaseChange++;
        } else {
          this.stepsWithoutPhaseChange = 0;
        }
        this.previousPhase = currentPhase;

        // Check if stalled
        if (this.config.maxStepsWithoutProgress > 0 &&
            this.stepsWithoutPhaseChange >= this.config.maxStepsWithoutProgress) {
          return { shouldTerminate: true, reason: "no_progress" };
        }
      }
    }

    // 2. Check messages for flag patterns
    for (const msg of messages) {
      const text = this.extractText(msg);
      if (text) {
        FLAG_PATTERN.lastIndex = 0;
        if (FLAG_PATTERN.test(text)) {
          return { shouldTerminate: true, reason: "flag_found" };
        }
      }
    }

    return { shouldTerminate: false };
  }

  private extractText(msg: ModelMessage): string | null {
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const part of msg.content) {
        if (typeof part === "string") {
          parts.push(part);
        } else if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          parts.push(part.text);
        }
      }
      return parts.join(" ");
    }
    return null;
  }
}
