// ─── Message ───

export type MessageKind =
  | "success"
  | "error"
  | "info"
  | "progress"
  | "cancelled"
  | "raw"
  | "flow_error";

export type TuiMessage = {
  id: number;
  kind: MessageKind;
  text: string;
};

// ─── Input mode ───

export type InputMode = "idle" | "thinking" | "running" | "asking";

// ─── Worker display ───

export type WorkerDisplay = {
  label: string;
  workerType: "my" | "other";
  status: "idle" | "busy" | "missing";
  task?: string;
  branch?: string;
  folder: string;
  gitClean?: boolean;
};

// ─── App state (generic over context) ───

export type AppState<Ctx> = {
  mode: InputMode;
  messages: TuiMessage[];
  workers: WorkerDisplay[];
  pendingQuestion: { prompt: string; resolve: (s: string) => void } | null;
  ctx: Ctx;
};

// ─── Actions ───

export type Action<Ctx> =
  | { type: "SET_MODE"; mode: InputMode }
  | { type: "ADD_MESSAGE"; message: TuiMessage }
  | { type: "SET_WORKERS"; workers: WorkerDisplay[] }
  | { type: "SET_QUESTION"; prompt: string; resolve: (s: string) => void }
  | { type: "CLEAR_QUESTION" }
  | { type: "SET_CTX"; ctx: Ctx }
  | { type: "CLEAR_MESSAGES" };
