import { defineTool } from "./define.js";
import { SPECIALIST_NAMES } from "../agent/definitions.js";

export const DelegateTool = defineTool({
  id: "delegate",
  description: `Delegate to a specialist CTF agent. After analyzing the challenge, use this tool to hand off to the appropriate specialist.

Available specialists: ${SPECIALIST_NAMES.join(", ")}

Provide a clear objective and any context you've gathered during triage.`,
  parameters: {
    type: "object",
    properties: {
      targetAgent: {
        type: "string",
        enum: SPECIALIST_NAMES,
        description: "The specialist agent to delegate to",
      },
      objective: {
        type: "string",
        description: "Specific task for the specialist agent",
      },
      context: {
        type: "string",
        description: "Key findings from triage to carry forward",
      },
    },
    required: ["targetAgent", "objective"],
  },
  async execute(args) {
    return {
      output: JSON.stringify({
        delegate: true,
        targetAgent: args.targetAgent,
        objective: args.objective,
        context: args.context ?? "",
      }),
    };
  },
});
