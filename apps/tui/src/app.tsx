import React, { useReducer, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import {
  reducer,
  createInitialState,
  setSink,
  setQuestionHandler,
  createQuestionFn,
} from "@laoda/ui-core";
import type { Action } from "@laoda/ui-core";
import { handleCommand } from "./command.ts";
import { scanWorkerStatus } from "./worker-scan.ts";
import type { Context } from "@laoda/cli/src/types.ts";
import { getModel } from "@laoda/cli/src/infra/config.ts";
import { Logger } from "@laoda/cli/src/infra/logger.ts";

import { Header } from "./components/header.tsx";
import { WorkerPanel } from "./components/worker-panel.tsx";
import { MessageLog } from "./components/message-log.tsx";
import { InputArea } from "./components/input-area.tsx";

type AppProps = {
  initialCtx: Context;
};

let msgId = 0;

export function App({ initialCtx }: AppProps) {
  const [state, dispatch] = useReducer(reducer, createInitialState(initialCtx));
  const abortRef = useRef<AbortController | null>(null);
  const loggerRef = useRef(new Logger(initialCtx.project));

  // Wire message sink → dispatch
  useEffect(() => {
    setSink((kind, text) => {
      dispatch({ type: "ADD_MESSAGE", message: { id: ++msgId, kind, text } });
    });
  }, []);

  // Wire question bridge → dispatch
  useEffect(() => {
    setQuestionHandler((prompt, resolve) => {
      dispatch({ type: "SET_QUESTION", prompt, resolve });
      dispatch({ type: "SET_MODE", mode: "asking" });
    });
  }, []);

  // Worker polling
  useEffect(() => {
    const poll = () => {
      try {
        const workers = scanWorkerStatus(state.ctx.cwd, state.ctx.registry);
        dispatch({ type: "SET_WORKERS", workers });
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [state.ctx.cwd, state.ctx.registry]);

  const llmLog = {
    request: (model: string, messages: unknown) => loggerRef.current.logLlmRequest(model, messages),
    response: (raw: string) => loggerRef.current.logLlmResponse(raw),
  };

  const onSubmit = async (input: string) => {
    // Handle question mode
    if (state.mode === "asking" && state.pendingQuestion) {
      state.pendingQuestion.resolve(input);
      dispatch({ type: "CLEAR_QUESTION" });
      return;
    }

    if (!input.trim()) return;

    loggerRef.current.logUserInput(input);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const nextCtx = await handleCommand(
        input.trim(),
        state.ctx,
        dispatch as (action: Action) => void,
        createQuestionFn(),
        llmLog,
        abort.signal,
      );
      dispatch({ type: "SET_CTX", ctx: nextCtx });
    } finally {
      abortRef.current = null;
      dispatch({ type: "SET_MODE", mode: "idle" });
    }
  };

  // Ctrl+C / Ctrl+D
  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Header project={state.ctx.project} agent={state.ctx.agent} model={getModel()} />
      <Text dimColor>{"─".repeat(50)}</Text>
      <WorkerPanel workers={state.workers} />
      <Text dimColor>{"─".repeat(50)}</Text>
      <MessageLog messages={state.messages} />
      <Text dimColor>{"─".repeat(50)}</Text>
      <InputArea
        mode={state.mode}
        questionPrompt={state.pendingQuestion?.prompt}
        onSubmit={onSubmit}
      />
    </Box>
  );
}
