import { createSession, spawnPane } from "./zellij.ts";
import { renderTaskStart, renderSessionInfo } from "./render.ts";

function generateSessionName(): string {
  const ts = Date.now().toString(36);
  return `laoda-${ts}`;
}

export function runBrain(task: string, cwd?: string): void {
  const sessionName = generateSessionName();

  renderTaskStart(task);

  createSession(sessionName);
  spawnPane(sessionName, task.slice(0, 40), task, cwd);

  renderSessionInfo(sessionName);
}
