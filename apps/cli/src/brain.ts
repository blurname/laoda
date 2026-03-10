import { spawnPane } from "./zellij.ts";
import { renderTaskStart, renderDone } from "./render.ts";

export function runBrain(task: string, cwd?: string): void {
  renderTaskStart(task);
  spawnPane(task.slice(0, 40), task, cwd);
  renderDone("Pane created");
}
