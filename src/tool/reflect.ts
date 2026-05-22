import { defineTool } from "./define.js";

export const ReflectTool = defineTool({
  id: "reflect",
  description: `Step back and think about your approach. Use this when:
- You're stuck or making no progress
- You've tried the same approach multiple times
- You need to reconsider your strategy
- You want to formulate a new hypothesis

This tool doesn't execute anything — it structures your thinking process.`,
  parameters: {
    type: "object",
    properties: {
      situation: {
        type: "string",
        description: "Current situation: what you've tried and what happened",
      },
      hypothesis: {
        type: "string",
        description: "New hypothesis or approach to try",
      },
      failedPaths: {
        type: "string",
        description: "Approaches that have already failed",
      },
    },
    required: ["situation"],
  },
  async execute(args) {
    const parts: string[] = [];
    parts.push("## Reflection");
    parts.push("");
    parts.push(`**Situation**: ${args.situation}`);
    if (args.failedPaths) {
      parts.push(`**Failed approaches**: ${args.failedPaths}`);
    }
    if (args.hypothesis) {
      parts.push(`**New hypothesis**: ${args.hypothesis}`);
      parts.push("");
      parts.push("Consider this hypothesis carefully before proceeding. Update failed-paths.md if this approach also fails.");
    } else {
      parts.push("");
      parts.push("**Action needed**: Formulate a new hypothesis. Consider:");
      parts.push("1. What assumptions might be wrong?");
      parts.push("2. Is there a different category or technique to try?");
      parts.push("3. Did you miss anything in the initial reconnaissance?");
      parts.push("4. Can you approach the problem from a completely different angle?");
    }
    return { output: parts.join("\n") };
  },
});
