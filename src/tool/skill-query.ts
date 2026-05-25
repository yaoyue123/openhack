import { defineTool } from "./define.js";

export const SkillQueryTool = defineTool({
  id: "skill-query",
  description: [
    "Search your domain knowledge for specific attack techniques, tool usage, or reference material.",
    "",
    "WHEN TO USE:",
    "  - When you encounter a specific vulnerability type and need detailed attack patterns",
    "  - When you need reference syntax for PHP serialize, JWT structure, SQL injection payloads, etc.",
    "  - When the skill index mentions a topic relevant to your current challenge",
    "  - When your initial approach fails and you need to look up alternative techniques",
    "",
    "TIPS:",
    '  - Use specific keywords: skill-query(topics=["PHP deserialization", "unserialize"])',
    "  - Multiple topics broaden the search — all matching sections are returned",
    "  - The returned knowledge is from your full skill files, not the truncated summary",
  ].join("\n"),
  parameters: {
    type: "object",
    properties: {
      topics: {
        type: "array",
        items: { type: "string" },
        description: "Keywords or phrases to search for in skill knowledge files. All companion files matching any topic are returned.",
      },
    },
    required: ["topics"],
  },
  async execute(args) {
    // This tool needs the skill registry to function.
    // The actual search is done in agent-loop.ts via the tool wrapper.
    // This placeholder returns a message directing to the injected implementation.
    return {
      output: "skill-query: use this tool to search domain knowledge. The skill registry is injected at runtime.",
    };
  },
});
