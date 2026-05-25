/**
 * ValueExtractor automatically extracts useful structured information
 * from tool outputs and stores them for later use.
 *
 * Extracted patterns:
 * - Set-Cookie headers → cookies{}
 * - Server headers → server_info{}
 * - HTML/CSS comments → html_comments[]
 * - URLs → urls[]
 * - PHP unserialize references → php_patterns[]
 * - Form fields → forms[]
 * - Interesting HTTP headers → headers[]
 */

const URL_PATTERN = /https?:\/\/[^\s"<>'`)]+/gi;
const COOKIE_PATTERN = /Set-Cookie:\s*([^=]+)=([^;\s]+)/gi;
const SERVER_PATTERN = /(?:X-Powered-By|Server|X-AspNet-Version):\s*(.+)/gi;
const COMMENT_PATTERN = /<!--\s*(.+?)\s*-->/gs;
const CSS_COMMENT_PATTERN = /\/\*\s*(.+?)\s*\*\//gs;
const PHP_SERIALIZE_PATTERN = /unserialize\s*\(/gi;
const FORM_PATTERN = /<form[^>]*action=["']([^"']*)["']/gi;
const HIDDEN_FIELD_PATTERN = /<input[^>]*type=["']hidden["'][^>]*value=["']([^"']*)["']/gi;
const FLAG_PATTERN = /(?:flag|CTF|HTB|picoCTF)\{[^}]+\}/gi;

export interface ExtractedValue {
  category: string;
  key: string;
  value: string;
}

export class ValueExtractor {
  /**
   * Extract structured values from tool output.
   */
  extract(toolId: string, args: Record<string, unknown>, output: string): ExtractedValue[] {
    const values: ExtractedValue[] = [];

    // Only extract from HTTP/text responses
    if (!output || output.length < 10) return values;

    // Cookies
    let cookieMatch: RegExpExecArray | null;
    COOKIE_PATTERN.lastIndex = 0;
    while ((cookieMatch = COOKIE_PATTERN.exec(output)) !== null) {
      values.push({ category: "cookies", key: cookieMatch[1], value: cookieMatch[2] });
    }

    // Server info
    SERVER_PATTERN.lastIndex = 0;
    let serverMatch: RegExpExecArray | null;
    while ((serverMatch = SERVER_PATTERN.exec(output)) !== null) {
      const headerName = output.slice(Math.max(0, serverMatch.index - 20), serverMatch.index).split("\n").pop()?.split(":")[0]?.trim() ?? "Server-Header";
      values.push({ category: "server_info", key: headerName, value: serverMatch[1].trim() });
    }

    // HTML comments
    COMMENT_PATTERN.lastIndex = 0;
    let commentMatch: RegExpExecArray | null;
    while ((commentMatch = COMMENT_PATTERN.exec(output)) !== null) {
      values.push({ category: "html_comments", key: `comment_${values.filter(v => v.category === "html_comments").length + 1}`, value: commentMatch[1].trim() });
    }

    // CSS comments
    CSS_COMMENT_PATTERN.lastIndex = 0;
    let cssMatch: RegExpExecArray | null;
    while ((cssMatch = CSS_COMMENT_PATTERN.exec(output)) !== null) {
      values.push({ category: "css_comments", key: `css_comment_${values.filter(v => v.category === "css_comments").length + 1}`, value: cssMatch[1].trim() });
    }

    // URLs
    URL_PATTERN.lastIndex = 0;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = URL_PATTERN.exec(output)) !== null) {
      const url = urlMatch[0];
      if (!url.includes("fonts.googleapis") && !url.includes("gravatar.com")) {
        values.push({ category: "urls", key: `url_${values.filter(v => v.category === "urls").length + 1}`, value: url });
      }
    }

    // PHP unserialize references
    if (PHP_SERIALIZE_PATTERN.test(output)) {
      values.push({ category: "php_patterns", key: "vulnerability", value: "unserialize() call detected - potential PHP deserialization attack" });
    }

    // Form actions
    FORM_PATTERN.lastIndex = 0;
    let formMatch: RegExpExecArray | null;
    while ((formMatch = FORM_PATTERN.exec(output)) !== null) {
      values.push({ category: "forms", key: `form_${values.filter(v => v.category === "forms").length + 1}`, value: `action=${formMatch[1]}` });
    }

    // Hidden form fields
    HIDDEN_FIELD_PATTERN.lastIndex = 0;
    let hiddenMatch: RegExpExecArray | null;
    while ((hiddenMatch = HIDDEN_FIELD_PATTERN.exec(output)) !== null) {
      values.push({ category: "hidden_fields", key: `hidden_${values.filter(v => v.category === "hidden_fields").length + 1}`, value: hiddenMatch[1] });
    }

    // Flags (not for extraction but for confirmation)
    FLAG_PATTERN.lastIndex = 0;
    if (FLAG_PATTERN.test(output)) {
      values.push({ category: "flags", key: "potential_flag", value: "Flag pattern detected in output" });
    }

    return values;
  }

  /**
   * Format extracted values as markdown for injection into system prompt.
   */
  formatAsMarkdown(values: ExtractedValue[]): string {
    if (values.length === 0) return "";

    const grouped: Record<string, string[]> = {};
    for (const v of values) {
      if (!grouped[v.category]) grouped[v.category] = [];
      grouped[v.category].push(`  - ${v.key}: ${v.value}`);
    }

    const sections: string[] = [];
    for (const [category, lines] of Object.entries(grouped)) {
      sections.push(`### ${category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`);
      sections.push(lines.join("\n"));
    }

    return sections.join("\n\n");
  }
}
