import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { AgentStatus } from "../types.js";
import { agentStatusStyles, spinnerFrames, spinnerInterval, colors, decor } from "../theme.js";

interface SpinnerProps {
  readonly status: AgentStatus;
}

function Spinner({ status }: SpinnerProps): React.JSX.Element | null {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (status === "idle") return;

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % spinnerFrames.length);
    }, spinnerInterval);

    return () => clearInterval(timer);
  }, [status]);

  if (status === "idle") return null;

  const style = agentStatusStyles[status] ?? agentStatusStyles.thinking;
  const frame = spinnerFrames[frameIndex];

  return (
    <Box>
      <Text color={style.color}>{`${decor.leftBorder} `}</Text>
      <Text color={style.color}>{`${frame} `}</Text>
      <Text color={style.color}>{`${style.label}...`}</Text>
    </Box>
  );
}

export { Spinner };
