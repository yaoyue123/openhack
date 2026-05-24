import React from "react";
import { Box, Text } from "ink";
import type { ToolCallStatus } from "../types.js";
import { toolStatusStyles, toolIcons, colors, decor } from "../theme.js";

interface ToolCallDisplayProps {
  readonly tool: string;
  readonly args: string;
  readonly status?: ToolCallStatus;
  readonly detail?: string;
  readonly expanded?: boolean;
  readonly startTime?: number;
}

function summarizeArgs(tool: string, args: string): string {
  try {
    const parsed = JSON.parse(args);
    switch (tool) {
      case "bash":
      case "python":
        return String(parsed.command ?? parsed.code ?? args).slice(0, 60);
      case "read":
      case "write":
        return String(parsed.filePath ?? args);
      case "edit": {
        const fp = String(parsed.filePath ?? "");
        const old = String(parsed.oldString ?? "").slice(0, 30);
        return `${fp} "${old}..."`;
      }
      case "glob":
      case "grep":
        return String(parsed.pattern ?? args);
      case "webfetch":
        return String(parsed.url ?? args).slice(0, 50);
      case "flag":
        return String(parsed.flag ?? args);
      default:
        return "";
    }
  } catch {
    return args.slice(0, 50);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ToolCallDisplay({
  tool,
  args,
  status = "pending",
  detail,
  expanded = false,
  startTime,
}: ToolCallDisplayProps): React.JSX.Element {
  const style = toolStatusStyles[status];
  const iconDef = toolIcons[tool] ?? toolIcons.default;
  const summary = summarizeArgs(tool, args);

  // Elapsed time counter for pending tools
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (status !== "pending" || !startTime) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(id);
  }, [status, startTime]);

  // Status icon
  const statusIcon =
    status === "pending" ? "\u22EF" : status === "success" ? "\u2713" : "\u2717";
  const statusColor =
    status === "pending" ? colors.textMuted : status === "success" ? colors.success : colors.error;

  // Duration string
  const durationMs = status === "pending" ? elapsed : undefined;

  return (
    <Box flexDirection="column">
      {/* Main tool line */}
      <Box>
        <Text color={colors.textMuted}>{`${decor.leftBorder} `}</Text>
        <Text color={statusColor}>{`${statusIcon} `}</Text>
        <Text color={colors.text}>{iconDef.icon}</Text>
        <Text>{` `}</Text>
        {expanded ? (
          <Text color={colors.textMuted}>{tool}</Text>
        ) : (
          <Text color={colors.text}>{summary || iconDef.pending}</Text>
        )}
        {durationMs !== undefined && (
          <Text color={status === "pending" ? colors.textMuted : statusColor}>
            {` ${formatDuration(durationMs)}`}
          </Text>
        )}
        {expanded && status !== "pending" && durationMs === undefined && startTime && (
          <Text color={statusColor}>{` ${formatDuration(0)}`}</Text>
        )}
        {/* Expand/collapse hint */}
        {status !== "pending" && detail && (
          <Text color={colors.textMuted}>{expanded ? " \u25B4" : " \u25BE"}</Text>
        )}
      </Box>

      {/* Expanded output preview with diff highlighting */}
      {expanded && detail && (
        <Box flexDirection="column" marginLeft={6}>
          {detail.split("\n").slice(0, 8).map((line, i) => {
            const truncated = line.length > 100 ? line.slice(0, 100) + "..." : line;
            // Color diff-style lines
            if (line.startsWith("+") && !line.startsWith("+++")) {
              return <Text key={i} color={colors.success}>{truncated}</Text>;
            }
            if (line.startsWith("-") && !line.startsWith("---")) {
              return <Text key={i} color={colors.error}>{truncated}</Text>;
            }
            if (line.startsWith("@@")) {
              return <Text key={i} color={colors.accent}>{truncated}</Text>;
            }
            return (
              <Text key={i} dimColor>{truncated}</Text>
            );
          })}
          {detail.split("\n").length > 8 && (
            <Text dimColor>{`  ... (${detail.split("\n").length - 8} more lines)`}</Text>
          )}
        </Box>
      )}

      {/* Expanded args detail */}
      {expanded && !detail && args && args !== "{}" && (
        <Box marginLeft={6}>
          <Text dimColor>{summarizeArgs(tool, args)}</Text>
        </Box>
      )}
    </Box>
  );
}

export { ToolCallDisplay, summarizeArgs };
export type { ToolCallDisplayProps };
