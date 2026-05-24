import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  readonly id: number;
  readonly type: ToastType;
  readonly message: string;
}

interface ToastsProps {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: number) => void;
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: "\u2713",
  error: "\u2717",
  warning: "\u26A0",
  info: "\u2139",
};

const TOAST_COLORS: Record<ToastType, string> = {
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
  info: colors.secondary,
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}): React.JSX.Element {
  const color = TOAST_COLORS[toast.type];
  const icon = TOAST_ICONS[toast.type];

  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <Box marginLeft={2}>
      <Text color={color}>{`${icon} `}</Text>
      <Text>{toast.message}</Text>
    </Box>
  );
}

function Toasts({ toasts, onDismiss }: ToastsProps): React.JSX.Element | null {
  if (toasts.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </Box>
  );
}

export { Toasts };
export type { Toast, ToastType };
