import type { AppState, Action } from "./types.ts";

export function createInitialState<Ctx>(ctx: Ctx): AppState<Ctx> {
  return {
    mode: "idle",
    messages: [],
    workers: [],
    pendingQuestion: null,
    ctx,
  };
}

export function reducer<Ctx>(state: AppState<Ctx>, action: Action<Ctx>): AppState<Ctx> {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };

    case "SET_WORKERS":
      return { ...state, workers: action.workers };

    case "SET_QUESTION":
      return {
        ...state,
        pendingQuestion: { prompt: action.prompt, resolve: action.resolve },
      };

    case "CLEAR_QUESTION":
      return { ...state, pendingQuestion: null };

    case "SET_CTX":
      return { ...state, ctx: action.ctx };

    case "CLEAR_MESSAGES":
      return { ...state, messages: [] };
  }
}
