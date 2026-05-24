import { defineTool } from "./define.js";
import { checkPermission } from "./security.js";

export const WebFetchTool = defineTool({
  id: "webfetch",
  description: "Fetch content from a URL and return it as text.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch",
      },
      format: {
        type: "string",
        description: "Desired format (default: text)",
      },
    },
    required: ["url"],
  },
  execute: async (args, ctx) => {
    const permDenied = await checkPermission(ctx, "webfetch", args.url);
    if (permDenied) return permDenied;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(args.url, {
        headers: {
          "User-Agent": "openhack/0.1.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          output: `HTTP ${response.status}: ${response.statusText}`,
          error: true,
        };
      }

      const text = await response.text();
      const maxBytes = 50 * 1024;
      const truncated = text.length > maxBytes;
      const content = truncated ? text.slice(0, maxBytes) : text;

      return {
        output: truncated
          ? content + "\n\n[... truncated at 50KB ...]"
          : content,
        metadata: truncated ? { truncated: true } : undefined,
      };
    } catch (err: unknown) {
      const message = (err as Error).message || "Failed to fetch URL";
      return { output: message, error: true };
    } finally {
      clearTimeout(timeout);
    }
  },
});
