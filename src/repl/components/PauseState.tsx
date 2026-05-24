import React from "react";
import { Box, Text } from "ink";
import { pauseStyle, colors, decor } from "../theme.js";

interface PauseStateProps {
  readonly stepIndex: number;
  readonly maxSteps: number;
}

function PauseState({ stepIndex, maxSteps }: PauseStateProps): React.JSX.Element {
  return (
    <Box paddingLeft={1} marginTop={1}>
      <Text color={pauseStyle.borderColor}>{`${decor.leftBorder} `}</Text>
      <Text color={pauseStyle.textColor}>{`⏸ paused ${stepIndex}/${maxSteps} `}</Text>
      <Text color={pauseStyle.dimColor}>{`${decor.separator} `}</Text>
      <Text color={pauseStyle.promptColor} bold>{"Enter"}</Text>
      <Text color={pauseStyle.dimColor}>{" continue "}</Text>
      <Text color={pauseStyle.promptColor} bold>{"s"}</Text>
      <Text color={pauseStyle.dimColor}>{" stop "}</Text>
      <Text color={pauseStyle.promptColor} bold>{"type"}</Text>
      <Text color={pauseStyle.dimColor}>{" redirect"}</Text>
    </Box>
  );
}

export { PauseState };
export type { PauseStateProps };
