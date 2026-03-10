export interface LlmConfig {
  provider: "openrouter" | "volcengine";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface LaoConfig {
  projects: import("./store.ts").CliProject[];
  llm?: LlmConfig;
}

export interface SubTask {
  id: number;
  title: string;
  prompt: string;
  cwd?: string;
}

export interface TaskPlan {
  originalTask: string;
  subtasks: SubTask[];
  sessionName: string;
}
