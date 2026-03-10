import { decompose } from "./llm.ts";
import { createSession, spawnPane } from "./zellij.ts";
import { renderPlan, renderSessionInfo, renderDecomposing } from "./render.ts";
import type { TaskPlan } from "./types.ts";

function generateSessionName(): string {
  const ts = Date.now().toString(36);
  return `laoda-${ts}`;
}

export async function runBrain(task: string, cwd?: string): Promise<void> {
  renderDecomposing(task);

  const subtasks = await decompose(task);

  if (cwd) {
    for (const st of subtasks) {
      if (!st.cwd) st.cwd = cwd;
    }
  }

  const sessionName = generateSessionName();
  const plan: TaskPlan = { originalTask: task, subtasks, sessionName };

  renderPlan(plan);

  createSession(sessionName);

  for (const subtask of subtasks) {
    spawnPane(sessionName, subtask);
  }

  renderSessionInfo(sessionName, subtasks.length);
}
