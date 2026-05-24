import React from "react";
import { Box, Text } from "ink";
import { statusBarStyle, colors, decor, getAgentColor } from "../theme.js";

interface StatusBarProps {
  readonly agentName: string;
  readonly stepIndex: number;
  readonly maxSteps: number;
  readonly phase?: string;
  readonly toolCount: number;
  readonly modelName?: string;
  readonly sessionId?: string;
  readonly tokenCurrent?: number;
  readonly tokenMax?: number;
  readonly runStartTime?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function StatusBar({
  agentName,
  stepIndex,
  maxSteps,
  phase,
  toolCount,
  modelName,
  sessionId,
  tokenCurrent,
  tokenMax,
  runStartTime,
}: StatusBarProps): React.JSX.Element {
  const agentColor = getAgentColor(agentName);

  // ── Elapsed time ────────────────────────────────────────────
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (!runStartTime) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed(Date.now() - runStartTime), 500);
    return () => clearInterval(id);
  }, [runStartTime]);

  // ── Token usage bar ─────────────────────────────────────────
  const tokenPct = tokenMax && tokenMax > 0 ? Math.min(100, Math.round(((tokenCurrent ?? 0) / tokenMax) * 100)) : 0;
  const barWidth = 8;
  const filledWidth = Math.round((tokenPct / 100) * barWidth);
  const barFill = "\u2588".repeat(filledWidth);
  const barEmpty = "\u2591".repeat(Math.max(0, barWidth - filledWidth));

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* Line 1: Agent + step + phase + tools + elapsed */}
      <Box gap={1}>
        <Text>
          <Text color={agentColor}>{`${decor.agent} `}</Text>
          <Text color={statusBarStyle.textColor}>{agentName}</Text>
        </Text>

        <Text color={colors.textMuted}>{`${stepIndex}/${maxSteps}`}</Text>

        {phase && (
          <Text>
            <Text color={colors.textMuted}>{`${decor.separator} `}</Text>
            <Text color={statusBarStyle.accentColor}>{phase}</Text>
          </Text>
        )}

        {toolCount > 0 && (
          <Text>
            <Text color={colors.textMuted}>{`${decor.separator} `}</Text>
            <Text color={colors.textMuted}>{`${toolCount} tools`}</Text>
          </Text>
        )}

        {elapsed > 0 && (
          <Text color={colors.textMuted}>{formatDuration(elapsed)}</Text>
        )}
      </Box>

      {/* Line 2: Token bar + model + session */}
      <Box gap={1}>
        {/* Token usage bar */}
        <Text>
          <Text color={tokenPct > 80 ? colors.warning : colors.success}>{barFill}</Text>
          <Text color={colors.dim}>{barEmpty}</Text>
        </Text>
        <Text color={tokenPct > 80 ? colors.warning : colors.textMuted}>
          {`${tokenPct}%`}
        </Text>

        {modelName && (
          <Text color={colors.textMuted}>
            {`${decor.separator} ${modelName}`}
          </Text>
        )}

        {sessionId && (
          <Text color={colors.textMuted}>
            {`${decor.separator} ${sessionId.slice(0, 8)}`}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export { StatusBar };
export type { StatusBarProps };
