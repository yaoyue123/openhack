import React, { useEffect } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { exec } from "node:child_process";
import { ChatMessage } from "./components/ChatMessage.js";
import { Input } from "./components/Input.js";
import { ToolCallDisplay } from "./components/ToolCallDisplay.js";
import { Spinner } from "./components/Spinner.js";
import { Welcome } from "./components/Welcome.js";
import { StatusBar } from "./components/StatusBar.js";
import { PauseState } from "./components/PauseState.js";
import { Toasts } from "./components/Toast.js";
import type { Toast, ToastType } from "./components/Toast.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { SlashCommandRegistry, createBuiltinSlashCommands } from "./slash-commands.js";
import type { SlashContext } from "./slash-commands.js";
import type { AgentStatus, ToolCallStatus, AgentRunState, StepContext } from "./types.js";
import type { Session } from "../session/store.js";
import type { PauseController } from "../agent/pause-controller.js";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ToolCall {
  tool: string;
  args: string;
  status: ToolCallStatus;
  detail?: string;
}

interface REPLState {
  messages: Message[];
  agentRunState: AgentRunState;
  currentAgent: string;
  toolCalls: ToolCall[];
  streamingText: string;
  agentStatus: AgentStatus;
  showWelcome: boolean;
  stepContext: StepContext | null;
  expandedTools: Record<number, boolean>;
  toolStartTimes: Record<number, number>;
  scrollOffset: number;
  modelName: string;
  sessionId: string;
  runStartTime: number | null;
  tokenCurrent: number;
  tokenMax: number;
  toasts: Toast[];
  nextToastId: number;
  showCommandPalette: boolean;
}

type REPLAction =
  | { kind: "add_message"; message: Message }
  | { kind: "set_agent_run_state"; state: AgentRunState }
  | { kind: "set_agent"; agent: string }
  | { kind: "add_tool_call"; toolCall: ToolCall }
  | { kind: "append_streaming"; token: string }
  | { kind: "clear_streaming" }
  | { kind: "set_status"; status: AgentStatus }
  | { kind: "set_tool_result"; index: number; status: ToolCallStatus; detail?: string }
  | { kind: "clear_messages" }
  | { kind: "set_step_context"; ctx: StepContext | null }
  | { kind: "set_tool_expanded"; index: number; expanded: boolean }
  | { kind: "set_scroll"; offset: number }
  | { kind: "toggle_all_tools" }
  | { kind: "set_model_info"; modelName: string; sessionId: string; tokenCurrent: number; tokenMax: number }
  | { kind: "add_toast"; toast: Toast }
  | { kind: "dismiss_toast"; id: number }
  | { kind: "set_command_palette"; show: boolean };

function replReducer(state: REPLState, action: REPLAction): REPLState {
  switch (action.kind) {
    case "add_message":
      return { ...state, messages: [...state.messages, action.message], showWelcome: false, scrollOffset: 0 };
    case "set_agent_run_state": {
      const newState = { ...state, agentRunState: action.state };
      // Track when agent starts running for elapsed time counter
      if (action.state.state === "running") {
        newState.runStartTime = Date.now();
      }
      if (action.state.state === "idle") {
        newState.runStartTime = null;
      }
      return newState;
    }
    case "set_agent":
      return { ...state, currentAgent: action.agent };
    case "add_tool_call": {
      const idx = state.toolCalls.length;
      return {
        ...state,
        toolCalls: [...state.toolCalls, action.toolCall],
        toolStartTimes: { ...state.toolStartTimes, [idx]: Date.now() },
        expandedTools: { ...state.expandedTools, [idx]: false },
      };
    }
    case "append_streaming":
      return { ...state, streamingText: state.streamingText + action.token };
    case "clear_streaming":
      return { ...state, streamingText: "" };
    case "set_status":
      return { ...state, agentStatus: action.status };
    case "set_tool_result": {
      const updated = [...state.toolCalls];
      if (updated[action.index]) {
        updated[action.index] = { ...updated[action.index], status: action.status, detail: action.detail };
      }
      // Auto-expand error tools, collapse successful ones
      const shouldExpand = action.status === "error";
      const shouldCollapse = action.status === "success" && state.expandedTools[action.index];
      return {
        ...state,
        toolCalls: updated,
        expandedTools: shouldExpand
          ? { ...state.expandedTools, [action.index]: true }
          : shouldCollapse
            ? { ...state.expandedTools, [action.index]: false }
            : state.expandedTools,
      };
    }
    case "clear_messages":
      return { ...state, messages: [], toolCalls: [], streamingText: "", stepContext: null, expandedTools: {}, toolStartTimes: {}, scrollOffset: 0, runStartTime: null, tokenCurrent: 0 };

    case "set_scroll":
      return { ...state, scrollOffset: Math.max(0, action.offset) };

    case "toggle_all_tools": {
      const allExpanded = state.toolCalls.length > 0 && !Object.values(state.expandedTools).every(Boolean);
      const newExpanded: Record<number, boolean> = {};
      for (let i = 0; i < state.toolCalls.length; i++) {
        newExpanded[i] = allExpanded;
      }
      return { ...state, expandedTools: newExpanded };
    }

    case "set_model_info":
      return { ...state, modelName: action.modelName, sessionId: action.sessionId, tokenCurrent: action.tokenCurrent, tokenMax: action.tokenMax };

    case "add_toast":
      return { ...state, toasts: [...state.toasts, { ...action.toast }], nextToastId: state.nextToastId + 1 };

    case "dismiss_toast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    case "set_command_palette":
      return { ...state, showCommandPalette: action.show };
    case "set_tool_expanded": {
      return {
        ...state,
        expandedTools: { ...state.expandedTools, [action.index]: action.expanded },
      };
    }
    case "set_step_context":
      return { ...state, stepContext: action.ctx };
  }
}

interface StartREPLOptions {
  onSubmit: (message: string, slashCtx: SlashContext | null) => Promise<void>;
  agentName?: string;
  version?: string;
}

interface REPLHandle {
  addMessage(message: Message): void;
  addToolCall(tool: string, args: string): void;
  setAgentRunState(state: AgentRunState): void;
  appendStreaming(token: string): void;
  clearStreaming(): void;
  setAgent(agent: string): void;
  setStatus(status: AgentStatus): void;
  setToolResult(index: number, status: ToolCallStatus, detail?: string): void;
  clearMessages(): void;
  setStepContext(ctx: StepContext | null): void;
  setModelInfo(modelName: string, sessionId: string, tokenCurrent: number, tokenMax: number): void;
  showToast(type: ToastType, message: string): void;
  getSlashRegistry(): SlashCommandRegistry;
  getSlashContext(): SlashContext;
  setSlashContext(ctx: SlashContext): void;
  /** Resume the agent after a pause */
  resume(): void;
  /** Redirect the agent with a new message */
  redirect(message: string): void;
  /** Stop the agent */
  stop(): void;
  /** Get the pause controller (if any) */
  getPauseController(): PauseController | null;
  /** Set the pause controller */
  setPauseController(controller: PauseController): void;
  unmount: () => void;
  waitUntilExit: () => Promise<unknown>;
}

function startREPL(options: StartREPLOptions): REPLHandle {
  const { onSubmit, agentName = "triage", version = "0.0.1" } = options;

  let dispatch: React.Dispatch<REPLAction> | null = null;
  let slashRegistry: SlashCommandRegistry | null = null;
  let slashContext: SlashContext | null = null;
  let appExit: (() => void) | null = null;
  const sharedBuffer = { current: "" };
  let pauseController: PauseController | null = null;
  let abortCurrent: (() => void) | null = null;
  let toastIdCounter = 0;

  function REPLWrapper(): React.JSX.Element {
    const [localState, localDispatch] = React.useReducer(replReducer, {
      messages: [],
      agentRunState: { state: "idle" } as AgentRunState,
      currentAgent: agentName,
      toolCalls: [],
      streamingText: "",
      agentStatus: "idle" as AgentStatus,
      showWelcome: true,
      stepContext: null as StepContext | null,
      expandedTools: {},
      toolStartTimes: {},
      scrollOffset: 0,
      modelName: "",
      sessionId: "",
      runStartTime: null,
      tokenCurrent: 0,
      tokenMax: 100000,
      toasts: [],
      nextToastId: 1,
      showCommandPalette: false,
    });

    // Streaming buffer for performance (batch token updates)
    useEffect(() => {
      dispatch = localDispatch;
      const timer = setInterval(() => {
        if (sharedBuffer.current) {
          localDispatch({ kind: "append_streaming", token: sharedBuffer.current });
          sharedBuffer.current = "";
        }
        }, 50);
      return () => clearInterval(timer);
    }, [localDispatch]);

    const { exit } = useApp();
    appExit = exit;

    const isInputEnabled = localState.agentRunState.state === "idle" || localState.agentRunState.state === "paused";
    const isIdle = localState.agentRunState.state === "idle";
    const isRunning = localState.agentRunState.state === "running";
    const isPaused = localState.agentRunState.state === "paused";

    const handleCancel = () => {
      if (isRunning && abortCurrent) {
        abortCurrent();
        localDispatch({ kind: "set_agent_run_state", state: { state: "idle" } });
        localDispatch({ kind: "set_status", status: "idle" });
      }
    };

    const handleToggleAllTools = () => {
      localDispatch({ kind: "toggle_all_tools" });
    };

    const handleCommandPalette = () => {
      localDispatch({ kind: "set_command_palette", show: !localState.showCommandPalette });
    };

    const handleDismissToast = (id: number) => {
      localDispatch({ kind: "dismiss_toast", id });
    };

    const handleCommandPaletteExecute = (name: string, args: string) => {
      localDispatch({ kind: "set_command_palette", show: false });
      if (slashRegistry) {
        const cmd = slashRegistry.tryParse(`/${name}`);
        if (cmd) {
          void cmd.execute(slashContext!, args).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            localDispatch({ kind: "add_message", message: { role: "system", content: `Error: ${msg}` } });
          });
        }
      }
    };

    // Global shortcuts (always active)
    useInput((_input, key) => {
      if (key.pageUp) {
        localDispatch({ kind: "set_scroll", offset: localState.scrollOffset + 5 });
      }
      if (key.pageDown) {
        localDispatch({ kind: "set_scroll", offset: Math.max(0, localState.scrollOffset - 5) });
      }
    });

    const handleSubmit = (value: string) => {
      if (isPaused && pauseController) {
        // During pause: redirect with the typed message
        pauseController.redirect(value);
        return;
      }

      // `!cmd` — execute as shell command
      if (value.startsWith("!")) {
        const shellCmd = value.slice(1).trim();
        if (shellCmd) {
          localDispatch({ kind: "add_message", message: { role: "user", content: value } });
          exec(shellCmd, { timeout: 10000 }, (err, stdout, stderr) => {
            const output = stdout || stderr || (err?.message ?? "");
            localDispatch({
              kind: "add_message",
              message: {
                role: "system",
                content: output.slice(0, 3000),
              },
            });
          });
        }
        return;
      }

      localDispatch({ kind: "add_message", message: { role: "user", content: value } });
      localDispatch({ kind: "set_agent_run_state", state: { state: "running" } });
      localDispatch({ kind: "clear_streaming" });

      // Check slash commands
      if (slashRegistry && value.startsWith("/")) {
        const cmd = slashRegistry.tryParse(value);
        if (cmd) {
          const parsed = slashRegistry.parseArgs(value);
          const args = parsed?.args ?? "";
          void cmd.execute(slashContext!, args)
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              localDispatch({ kind: "add_message", message: { role: "system", content: `Error: ${msg}` } });
            })
            .finally(() => {
              localDispatch({ kind: "set_agent_run_state", state: { state: "idle" } });
            });
          return;
        }
        localDispatch({ kind: "add_message", message: { role: "system", content: `Unknown command: ${value.split(/\s/)[0]}. Type /help.` } });
        localDispatch({ kind: "set_agent_run_state", state: { state: "idle" } });
        return;
      }

      // Regular message → agent
      const controller = new AbortController();
      abortCurrent = () => controller.abort();
      void onSubmit(value, slashContext)
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if ((err as Error).name === "AbortError") return;
          const msg = err instanceof Error ? err.message : String(err);
          localDispatch({ kind: "add_message", message: { role: "system", content: `Error: ${msg}` } });
        })
        .finally(() => {
          abortCurrent = null;
          localDispatch({ kind: "set_agent_run_state", state: { state: "idle" } });
          localDispatch({ kind: "set_status", status: "idle" });
        });
    };

    // Step context for status bar
    const sc = localState.stepContext;

    // Apply scroll offset: only show messages from scrollOffset onwards
    const visibleMessages = localState.messages.slice(localState.scrollOffset);
    const isScrolled = localState.scrollOffset > 0;

    return (
      <Box flexDirection="column" padding={1}>
        <Box flexDirection="column">
          {localState.showWelcome && <Welcome version={version} />}

          {/* Toasts (notifications) */}
          <Toasts toasts={localState.toasts} onDismiss={handleDismissToast} />

          {/* Scroll indicator */}
          {isScrolled && (
            <Box>
              <Text dimColor>{`\u2191 ${localState.scrollOffset} more  (PgUp/PgDown to scroll, Enter returns to bottom)`}</Text>
            </Box>
          )}

          {visibleMessages.map((msg, i) => (
            <ChatMessage key={localState.scrollOffset + i} message={msg} />
          ))}

          {localState.toolCalls.map((tc, i) => (
            <ToolCallDisplay
              key={`tool-${i}`}
              tool={tc.tool}
              args={tc.args}
              status={tc.status}
              detail={tc.detail}
              expanded={localState.expandedTools[i] ?? false}
              startTime={localState.toolStartTimes[i]}
            />
          ))}

          {isRunning && localState.streamingText.length > 0 && (
            <ChatMessage
              message={{ role: "assistant", content: localState.streamingText }}
              streaming={true}
            />
          )}

          {isRunning && <Spinner status={localState.agentStatus} />}

          {isPaused && sc && (
            <PauseState stepIndex={sc.iteration} maxSteps={sc.maxSteps} />
          )}
        </Box>

        {/* Status Bar — always visible once session has started */}
        {!localState.showWelcome && (
          <Box marginTop={1}>
            <StatusBar
              agentName={localState.currentAgent}
              stepIndex={sc?.iteration ?? 0}
              maxSteps={sc?.maxSteps ?? 0}
              phase={sc?.phase}
              toolCount={localState.toolCalls.length}
              modelName={localState.modelName || undefined}
              sessionId={localState.sessionId || undefined}
              tokenCurrent={localState.tokenCurrent}
              tokenMax={localState.tokenMax}
              runStartTime={localState.runStartTime ?? undefined}
            />
          </Box>
        )}

        {/* Command Palette */}
        {localState.showCommandPalette && (
          <CommandPalette
            commands={
              slashRegistry?.list().map((c) => ({
                name: c.name,
                description: c.description,
                usage: c.usage,
              })) ?? []
            }
            onExecute={handleCommandPaletteExecute}
            onDismiss={() => localDispatch({ kind: "set_command_palette", show: false })}
          />
        )}

        {/* Input area */}
        <Box marginTop={1}>
          <Input
            prompt={localState.currentAgent}
            onSubmit={handleSubmit}
            disabled={!isInputEnabled || localState.showCommandPalette}
            onCancel={!isIdle ? handleCancel : undefined}
            onExit={exit}
            onToggleTools={handleToggleAllTools}
            onCommandPalette={handleCommandPalette}
            slashCommands={slashRegistry?.list().map((c) => c.name) ?? []}
          />
        </Box>
      </Box>
    );
  }

  const instance = render(<REPLWrapper />);

  // Initialize slash registry
  slashRegistry = createBuiltinSlashCommands();

  const handle: REPLHandle = {
    addMessage(message: Message) {
      dispatch?.({ kind: "add_message", message });
    },
    addToolCall(tool: string, args: string) {
      dispatch?.({ kind: "add_tool_call", toolCall: { tool, args, status: "pending" } });
    },
    setAgentRunState(state: AgentRunState) {
      dispatch?.({ kind: "set_agent_run_state", state });
    },
    appendStreaming(token: string) {
      sharedBuffer.current += token;
    },
    clearStreaming() {
      dispatch?.({ kind: "clear_streaming" });
    },
    setAgent(agent: string) {
      dispatch?.({ kind: "set_agent", agent });
    },
    setStatus(status: AgentStatus) {
      dispatch?.({ kind: "set_status", status });
    },
    setToolResult(index: number, status: ToolCallStatus, detail?: string) {
      dispatch?.({ kind: "set_tool_result", index, status, detail });
    },
    clearMessages() {
      dispatch?.({ kind: "clear_messages" });
    },
    setStepContext(ctx: StepContext | null) {
      dispatch?.({ kind: "set_step_context", ctx });
    },
    setModelInfo(modelName: string, sessionId: string, tokenCurrent: number, tokenMax: number) {
      dispatch?.({ kind: "set_model_info", modelName, sessionId, tokenCurrent, tokenMax });
    },
    showToast(type: ToastType, message: string) {
      dispatch?.({
        kind: "add_toast",
        toast: { id: ++toastIdCounter, type, message },
      });
    },
    getSlashRegistry() {
      return slashRegistry!;
    },
    getSlashContext() {
      return slashContext!;
    },
    setSlashContext(ctx: SlashContext) {
      slashContext = ctx;
    },
    resume() {
      pauseController?.resume();
    },
    redirect(message: string) {
      pauseController?.redirect(message);
    },
    stop() {
      pauseController?.stop();
    },
    getPauseController() {
      return pauseController;
    },
    setPauseController(controller: PauseController) {
      pauseController = controller;
    },
    unmount: instance.unmount,
    waitUntilExit: instance.waitUntilExit,
  };

  return handle;
}

export { startREPL };
export type { REPLHandle, StartREPLOptions, Message };
