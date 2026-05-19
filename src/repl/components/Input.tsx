import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

interface InputProps {
  readonly prompt: string;
  readonly onSubmit: (value: string) => void;
  readonly disabled?: boolean;
}

function Input({ prompt, onSubmit, disabled = false }: InputProps): React.JSX.Element {
  const [value, setValue] = useState("");

  useInput(
    (input, key) => {
      if (key.return) {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          onSubmit(trimmed);
          setValue("");
        }
        return;
      }

      if (key.backspace) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: !disabled },
  );

  return (
    <Box>
      <Text color="cyan" bold>
        {`[${prompt}] > `}
      </Text>
      <Text>{disabled ? "..." : value}</Text>
      {!disabled && <Text dimColor>{"\u2588"}</Text>}
    </Box>
  );
}

export { Input };
export type { InputProps };
