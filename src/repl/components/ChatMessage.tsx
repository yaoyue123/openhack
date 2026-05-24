import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { type Token, type Tokens, parse } from "marked";
import { FlagHighlight } from "./FlagHighlight.js";
import { roleStyles, colors, decor } from "../theme.js";

interface Message {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

interface ChatMessageProps {
  readonly message: Message;
  readonly streaming?: boolean;
  readonly isGrouped?: boolean;
}

const ROLE_CONFIG = {
  user: roleStyles.user,
  assistant: roleStyles.assistant,
  system: roleStyles.system,
} as const;

// ── Simple keyword-based syntax highlighting ───────────────────

const LANG_KEYWORDS: Record<string, string[]> = {
  javascript: [
    "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "export", "extends", "finally",
    "for", "function", "if", "import", "in", "instanceof", "let", "new", "of",
    "return", "static", "super", "switch", "this", "throw", "try", "typeof",
    "var", "void", "while", "with", "yield",
  ],
  typescript: [
    "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "export", "extends", "finally",
    "for", "function", "if", "import", "in", "instanceof", "interface", "let",
    "new", "of", "return", "static", "super", "switch", "this", "throw", "try",
    "type", "typeof", "var", "void", "while", "with", "yield",
  ],
  python: [
    "and", "as", "assert", "async", "await", "break", "class", "continue",
    "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
    "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass",
    "raise", "return", "try", "while", "with", "yield",
  ],
  bash: [
    "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case",
    "esac", "function", "return", "exit", "export", "source", "local",
  ],
  json: [],
  yaml: [],
};

const KEYWORD_COLOR = colors.accent;
const STRING_COLOR = colors.success;
const NUMBER_COLOR = colors.primary;
const COMMENT_COLOR = colors.textMuted;
const DIFF_ADD_COLOR = colors.success;
const DIFF_DEL_COLOR = colors.error;
const DIFF_HEADER_COLOR = colors.textMuted;

/** Tokenize a single line of code with simple regex-based highlighting */
function highlightLine(line: string, lang: string): React.ReactNode[] {
  const normalizedLang = lang?.toLowerCase() ?? "";
  const keywords = LANG_KEYWORDS[normalizedLang] ?? [];

  // Tokenize: split into words, strings, numbers, comments, and other
  const tokens: { text: string; type: "keyword" | "string" | "number" | "comment" | "normal" }[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Single-line comment
    const commentMatch = remaining.match(/^(\/\/[^\n]*|#[^\n]*)/);
    if (commentMatch) {
      tokens.push({ text: commentMatch[1], type: "comment" });
      remaining = remaining.slice(commentMatch[1].length);
      continue;
    }

    // String (double, single, backtick)
    const stringMatch = remaining.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    if (stringMatch) {
      tokens.push({ text: stringMatch[1], type: "string" });
      remaining = remaining.slice(stringMatch[1].length);
      continue;
    }

    // Number
    const numberMatch = remaining.match(/^(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/);
    if (numberMatch) {
      tokens.push({ text: numberMatch[1], type: "number" });
      remaining = remaining.slice(numberMatch[1].length);
      continue;
    }

    // Word (keyword or identifier)
    const wordMatch = remaining.match(/^([a-zA-Z_$]\w*)/);
    if (wordMatch) {
      if (keywords.includes(wordMatch[1])) {
        tokens.push({ text: wordMatch[1], type: "keyword" });
      } else {
        tokens.push({ text: wordMatch[1], type: "normal" });
      }
      remaining = remaining.slice(wordMatch[1].length);
      continue;
    }

    // Skip whitespace as normal
    const wsMatch = remaining.match(/^(\s+)/);
    if (wsMatch) {
      tokens.push({ text: wsMatch[1], type: "normal" });
      remaining = remaining.slice(wsMatch[1].length);
      continue;
    }

    // Any other character
    tokens.push({ text: remaining[0]!, type: "normal" });
    remaining = remaining.slice(1);
  }

  return tokens.map((t, i) => {
    switch (t.type) {
      case "keyword":
        return <Text key={i} color={KEYWORD_COLOR}>{t.text}</Text>;
      case "string":
        return <Text key={i} color={STRING_COLOR}>{t.text}</Text>;
      case "number":
        return <Text key={i} color={NUMBER_COLOR}>{t.text}</Text>;
      case "comment":
        return <Text key={i} color={COMMENT_COLOR}>{t.text}</Text>;
      default:
        return <Text key={i}>{t.text}</Text>;
    }
  });
}

/** Check if code block content looks like a diff */
function isDiffContent(text: string): boolean {
  const lines = text.split("\n");
  let addRemoveCount = 0;
  for (const line of lines) {
    if (line.startsWith("+ ") || line.startsWith("- ") || line.startsWith("@@")) {
      addRemoveCount++;
    }
  }
  return addRemoveCount > Math.max(1, lines.length * 0.1);
}

/** Render code block with syntax highlighting or diff */
function renderCodeBlock(text: string, lang: string | undefined): React.ReactNode {
  const lines = text.split("\n");

  // Diff rendering
  const normalizedLang = lang?.toLowerCase() ?? "";
  if (normalizedLang.startsWith("diff") || isDiffContent(text)) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        {lines.map((line, i) => {
          if (line.startsWith("+ ")) {
            return (
              <Text key={i} color={DIFF_ADD_COLOR}>
                {`\u2502 ${line}`}
              </Text>
            );
          }
          if (line.startsWith("- ")) {
            return (
              <Text key={i} color={DIFF_DEL_COLOR}>
                {`\u2502 ${line}`}
              </Text>
            );
          }
          if (line.startsWith("@@")) {
            return (
              <Text key={i} color={DIFF_HEADER_COLOR}>
                {`\u2502 ${line}`}
              </Text>
            );
          }
          return (
            <Text key={i} color={colors.textMuted}>
              {`\u2502 ${line}`}
            </Text>
          );
        })}
      </Box>
    );
  }

  // Syntax-highlighted code
  return (
    <Box flexDirection="column" marginLeft={2}>
      {lang && (
        <Text dimColor color={colors.textMuted}>{`\u2502 ${lang}`}</Text>
      )}
      {lines.map((line, i) => (
        <Text key={i} color={colors.text}>
          {"\u2502 "}
          {highlightLine(line, lang ?? "")}
        </Text>
      ))}
    </Box>
  );
}

// ── Markdown token rendering ───────────────────────────────────

function renderTokens(
  tokens: Token[],
  keyPrefix: string = "",
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let idx = 0;

  for (const token of tokens) {
    const key = `${keyPrefix}${idx++}`;

    switch (token.type) {
      case "code": {
        const codeToken = token as Tokens.Code;
        elements.push(
          <Box key={key} flexDirection="column">
            {renderCodeBlock(codeToken.text, codeToken.lang ?? undefined)}
          </Box>,
        );
        break;
      }

      case "blockquote": {
        const bqToken = token as Tokens.Blockquote;
        elements.push(
          <Box key={key} flexDirection="column" marginLeft={1}>
            {renderTokens(bqToken.tokens ?? [], `${key}-`)}
          </Box>,
        );
        break;
      }

      case "heading": {
        const hToken = token as Tokens.Heading;
        elements.push(
          <Text key={key} bold color={colors.secondary}>
            {renderInlineTokens(hToken.tokens ?? [])}
          </Text>,
        );
        break;
      }

      case "list": {
        const listToken = token as Tokens.List;
        elements.push(
          <Box key={key} flexDirection="column">
            {listToken.items.map((item, i) => (
              <Box key={`${key}-${i}`} marginLeft={2}>
                <Text>{listToken.ordered ? `${i + 1}. ` : "\u2022 "}</Text>
                <Box flexDirection="column">
                  {item.tokens && renderTokens(item.tokens, `${key}-${i}-`)}
                  {item.text && (
                    <Text>{renderInlineTokens(tokenToInlineTokens(item))}</Text>
                  )}
                </Box>
              </Box>
            ))}
          </Box>,
        );
        break;
      }

      case "paragraph": {
        const pToken = token as Tokens.Paragraph;
        elements.push(
          <Text key={key}>
            {renderInlineTokens(pToken.tokens ?? [])}
          </Text>,
        );
        break;
      }

      case "space":
        elements.push(<Text key={key}>{" "}</Text>);
        break;

      case "hr":
        elements.push(
          <Text key={key} dimColor color={colors.border}>
            {"\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"}
          </Text>,
        );
        break;

      case "table": {
        const tableToken = token as Tokens.Table;
        const headers = tableToken.header?.map((h) => h.text) ?? [];
        const rows = tableToken.rows?.map((row) => row.map((cell) => cell.text)) ?? [];
        if (headers.length === 0 && rows.length === 0) break;

        // Calculate column widths
        const allRows = [headers, ...rows];
        const colWidths = headers.map((_, colIdx) => {
          const maxLen = Math.max(...allRows.map((row) => (row[colIdx] ?? "").length));
          return Math.min(maxLen, 30); // Cap at 30 chars per column
        });

        // Render header
        const headerLine = headers.map((h, i) => h.padEnd(colWidths[i]!)).join(" \u2502 ");
        elements.push(
          <Text key={`${key}-h`} color={colors.secondary} bold>{headerLine}</Text>,
        );

        // Render separator
        const sepLine = colWidths.map((w) => "\u2500".repeat(w)).join("\u2502");
        elements.push(
          <Text key={`${key}-s`} dimColor color={colors.border}>{sepLine}</Text>,
        );

        // Render rows
        for (let r = 0; r < rows.length; r++) {
          const rowLine = rows[r]!.map((cell, i) => (cell ?? "").padEnd(colWidths[i]!)).join(" \u2502 ");
          elements.push(
            <Text key={`${key}-r${r}`}>{rowLine}</Text>,
          );
        }
        break;
      }

      default:
        if ("raw" in token && typeof (token as any).raw === "string") {
          elements.push(<Text key={key}>{(token as any).raw}</Text>);
        }
        break;
    }
  }

  return elements;
}

function renderInlineTokens(tokens: Token[]): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "strong": {
        const sToken = token as Tokens.Strong;
        return <Text key={i} bold>{renderInlineTokens(sToken.tokens ?? [])}</Text>;
      }
      case "em": {
        const eToken = token as Tokens.Em;
        return <Text key={i} italic>{renderInlineTokens(eToken.tokens ?? [])}</Text>;
      }
      case "codespan": {
        const cToken = token as Tokens.Codespan;
        return (
          <Text key={i} color={colors.warning}>
            {`\`${cToken.text}\``}
          </Text>
        );
      }
      case "link": {
        const lToken = token as Tokens.Link;
        return (
          <Text key={i} color={colors.secondary} underline>
            {renderInlineTokens(lToken.tokens ?? [])}
          </Text>
        );
      }
      case "br":
        return <Text key={i}>{"\n"}</Text>;
      case "text":
      case "plain":
        return (
          <Text key={i}>
            {"raw" in token
              ? (token as any).raw ?? (token as any).text ?? ""
              : ""}
          </Text>
        );
      default:
        if ("raw" in token && typeof (token as any).raw === "string") {
          return <Text key={i}>{(token as any).raw}</Text>;
        }
        return null;
    }
  });
}

function tokenToInlineTokens(token: Token): Token[] {
  if ("tokens" in token && Array.isArray((token as any).tokens)) {
    return (token as any).tokens;
  }
  return [];
}

function ChatMessage({
  message,
  streaming = false,
  isGrouped = false,
}: ChatMessageProps): React.JSX.Element {
  const { role, content } = message;
  const style = ROLE_CONFIG[role];
  const isSystem = role === "system";

  const agentTokens = useMemo(() => {
    if (role !== "assistant") return null;
    try {
      const parsed = parse(content, { async: false });
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return null;
    }
  }, [content, role]);

  // Blinking cursor for streaming
  const [showCursor, setShowCursor] = React.useState(true);
  React.useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => setShowCursor((v) => !v), 530);
    return () => clearInterval(id);
  }, [streaming]);

  const agentColor = roleStyles.assistant.borderColor;

  return (
    <Box flexDirection="column" marginTop={isGrouped ? 0 : 1}>
      {role === "assistant" && agentTokens ? (
        // Rendered Markdown for assistant messages
        <Box flexDirection="column">
          {!isGrouped && (
            <Box>
              <Text color={style.borderColor}>{`${decor.leftBorder} `}</Text>
              <Text color={style.borderColor} dimColor>{`${style.label} `}</Text>
            </Box>
          )}
          {renderTokens(agentTokens, "md-").map((el, i) => (
            <Box key={i}>
              {!isGrouped && (
                <Text>{`${decor.leftBorder} `}</Text>
              )}
              <Box
                flexDirection="column"
                marginLeft={isGrouped ? 2 : style.label.length - 1}
              >
                {el}
              </Box>
            </Box>
          ))}
          {/* Streaming cursor at end */}
          {streaming && showCursor && (
            <Box>
              {!isGrouped && <Text>{`${decor.leftBorder} `}</Text>}
              <Box
                flexDirection="column"
                marginLeft={isGrouped ? 2 : style.label.length - 1}
              >
                <Text color={agentColor}>{"\u258E"}</Text>
              </Box>
            </Box>
          )}
        </Box>
      ) : (
        // Plain text rendering for user/system messages
        content.split("\n").map((line, i) => (
          <Box key={i}>
            {!isGrouped && (
              <Text color={style.borderColor}>{`${decor.leftBorder} `}</Text>
            )}
            {i === 0 && !isGrouped && (
              <Text color={style.borderColor} dimColor>{`${style.label} `}</Text>
            )}
            {i > 0 && !isGrouped && (
              <Text>{"".padEnd(style.label.length + 1)}</Text>
            )}
            {isGrouped && (
              <Text>{"  "}</Text>
            )}
            {isSystem ? (
              <Text dimColor>{line}</Text>
            ) : (
              <FlagHighlight content={line} />
            )}
          </Box>
        ))
      )}
    </Box>
  );
}

export { ChatMessage };
export type { Message, ChatMessageProps };
