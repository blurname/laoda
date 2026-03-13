// ─── Worker ───

export type MyWorkerStatus = "idle" | "busy";

export type MyWorker = {
  type: "my";
  index: number;
  status: MyWorkerStatus;
  task?: string;
  branch?: string;
};

export type UserType = "designer" | "product";

export type OtherWorker = {
  type: "other";
  name: string;
  userType: UserType;
};

export type Worker = MyWorker | OtherWorker;

// ─── Worker Registry ───
// 每个项目维护一份，存储在 ~/.local/share/laoda/workers/{project}.json

export type WorkerRegistry = {
  project: string;
  workers: Worker[];
  updatedAt: number;
};

// ─── Worker folder naming ───
// MyWorker  { index: 1 }         → {project}-1
// OtherWorker { name: "zar" }    → {project}-zar

export type WorkerFolder = {
  worker: Worker;
  path: string;
  exists: boolean;
};

// ─── Context ───

export type Context = {
  cwd: string;
  userName: string;
  project: string;
  registry: WorkerRegistry;
};

// ─── Shared fn types ───

export type QuestionFn = (prompt: string) => Promise<string>;

// ─── Effect ───

export type Effect =
  | { type: "print"; message: string }
  | { type: "prompt"; message: string }
  | { type: "confirm"; message: string }
  | { type: "duplicate_folder"; cwd: string; envFiles: string[] }
  | { type: "reuse_folder"; path: string }
  | { type: "prepare_branch"; dir: string; branch: string }
  | { type: "spawn_tab"; title: string; task: string; dir: string };
