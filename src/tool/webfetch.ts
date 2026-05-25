import { defineTool } from "./define.js";
import { checkPermission } from "./security.js";

export const WebFetchTool = defineTool({
  id: "webfetch",
  description: [
    "Fetch content from a URL and return it as text. Supports custom HTTP method, headers (including cookies), and request body.",
    "",
    "WHEN TO USE:",
    "  - Initial recon: GET a URL to read HTML/CSS/JS source code, check response headers, identify technologies",
    "  - Simple HTTP attacks: POST with form data, send cookies via headers parameter",
    "  - Checking responses: see HTTP status, Set-Cookie, Location, X-Powered-By headers in output",
    "",
    "LIMITATIONS:",
    "  - No session persistence (cookie jar) — each call is independent. You must manually extract cookies from one response and pass them in the next request's headers.",
    "  - No raw socket control — for low-level protocol attacks, use bash with netcat/openssl",
    "  - No proxy support — for traffic interception, use bash with curl --proxy",
    "  - Output truncated at 50KB — for large responses, use bash with curl to save to file",
    "",
    "ALTERNATIVES:",
    "  - For multi-step HTTP sessions (login then access protected page): use bash with curl --cookie-jar",
    "  - For complex attacks (multipart upload, chunked encoding, custom TLS): use bash with curl or python with requests",
    "  - For verbose debugging (full headers, timing, redirect chain): use bash with curl -v",
    "  - For HTTP brute force or fuzzing: use python with requests + threading",
    "",
    "TIPS:",
    '  - Cookie attacks: webfetch(url, headers=\'{"Cookie": "name=value"}\')',
    "  - Cookie values containing ; or quotes must be URL-encoded when constructing manually",
    "  - Use followRedirects=false to inspect 3xx redirect responses without following",
    "  - If webfetch returns the same response multiple times, switch to bash+curl for more control",
  ].join("\n"),
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch",
      },
      method: {
        type: "string",
        description: "HTTP method (GET, POST, PUT, DELETE, etc.). Default: GET",
      },
      headers: {
        type: "string",
        description:
          'JSON string of custom headers, e.g. \'{"Cookie": "session=abc", "Content-Type": "application/json"}\'. ' +
          "Use this for cookies, auth tokens, or content type overrides.",
      },
      body: {
        type: "string",
        description:
          "Request body for POST/PUT requests. For form data use 'key1=value1&key2=value2'. For JSON use a JSON string.",
      },
      followRedirects: {
        type: "boolean",
        description: "Whether to follow HTTP redirects (default: true). Set false to inspect redirect responses (3xx status, Location header).",
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
      const method = (args.method as string)?.toUpperCase() || "GET";
      const followRedirects = args.followRedirects !== false;

      // Parse custom headers
      const customHeaders: Record<string, string> = {
        "User-Agent": "openhack/0.1.0",
      };
      if (args.headers && typeof args.headers === "string") {
        try {
          const parsed = JSON.parse(args.headers as string) as Record<string, string>;
          for (const [key, value] of Object.entries(parsed)) {
            customHeaders[key] = value;
          }
        } catch {
          return {
            output: `Invalid headers JSON: ${args.headers}. Must be a valid JSON string like '{"Cookie": "name=value"}'.`,
            error: true,
          };
        }
      }

      // Build fetch options
      const fetchOptions: RequestInit = {
        method,
        headers: customHeaders,
        signal: controller.signal,
        redirect: followRedirects ? "follow" : "manual",
      };

      // Add body for POST/PUT/PATCH
      if (args.body && typeof args.body === "string" && ["POST", "PUT", "PATCH"].includes(method)) {
        fetchOptions.body = args.body;
        // Set default Content-Type if not provided
        if (!customHeaders["Content-Type"]) {
          customHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        }
      }

      const response = await fetch(args.url, fetchOptions);

      // Extract useful response headers
      const interestingHeaders = [
        "set-cookie",
        "location",
        "content-type",
        "x-powered-by",
        "server",
        "www-authenticate",
        "authorization",
      ];
      const headerLines: string[] = [];
      for (const [key, value] of response.headers.entries()) {
        if (interestingHeaders.includes(key.toLowerCase())) {
          headerLines.push(`${key}: ${value}`);
        }
      }

      const statusLine = `HTTP ${response.status} ${response.statusText}`;

      // For manual redirect mode, return status + headers without following
      if (!followRedirects && response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location") || "(none)";
        const cookies = response.headers.get("set-cookie") || "";
        return {
          output: `${statusLine}\nLocation: ${location}${cookies ? "\nSet-Cookie: " + cookies : ""}${headerLines.length > 0 ? "\n" + headerLines.join("\n") : ""}`,
        };
      }

      // Read body
      const text = await response.text();
      const maxBytes = 50 * 1024;
      const truncated = text.length > maxBytes;
      const content = truncated ? text.slice(0, maxBytes) : text;

      // Build output with headers + body
      let output = "";
      if (!response.ok || headerLines.length > 0) {
        output = `${statusLine}\n`;
        if (headerLines.length > 0) {
          output += headerLines.join("\n") + "\n";
        }
        output += "\n";
      }

      output += truncated ? content + "\n\n[... truncated at 50KB ...]" : content;

      return {
        output,
        metadata: {
          status: response.status,
          truncated: truncated || undefined,
        },
      };
    } catch (err: unknown) {
      const message = (err as Error).message || "Failed to fetch URL";
      return { output: message, error: true };
    } finally {
      clearTimeout(timeout);
    }
  },
});
