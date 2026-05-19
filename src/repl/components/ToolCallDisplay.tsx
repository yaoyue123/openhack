import React from "react";
import { Box, Text } from "ink";

interface ToolCallDisplayProps {
  readonly tool: string;
  readonly args: string;
}

function ToolCallDisplay({ tool, args }: ToolCallDisplayProps): React.JSX.Element {
  return (
    <Box>
      <Text color="yellow" dimColor>
        {"[tool: "}
      </Text>
      <Text color="yellow">{tool}</Text>
      <Text color="yellow" dimColor>
        {"] "}
      </Text>
      <Text dimColor>{args}</Text>
    </Box>
  );
}

export { ToolCallDisplay };
export type { ToolCallDisplayProps };
