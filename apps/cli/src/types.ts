export type Context = {
  cwd: string;
  userName: string;
};

export type Effect =
  | { type: "print"; message: string }
  | { type: "prompt"; message: string }
  | { type: "confirm"; message: string }
  | { type: "duplicate_folder"; cwd: string; envFiles: string[] }
  | { type: "reuse_folder"; path: string }
  | { type: "prepare_branch"; dir: string; branch: string }
  | { type: "spawn_tab"; title: string; task: string; dir: string };
