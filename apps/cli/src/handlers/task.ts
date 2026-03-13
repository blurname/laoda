import { spawnTab } from "../zellij.ts";
import { findReusableFolder } from "../workspace.ts";
import { findEnvFiles, prepareGitBranch } from "../git.ts";
import { duplicateFolder } from "@laoda/capability";
import { logAction } from "../logger.ts";
import type { IntentTask } from "../llm.ts";
import type { Context, QuestionFn } from "../types.ts";
import {
  renderTask,
  renderReuse,
  renderDuplicating,
  renderDuplicated,
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  renderCancelled,
  promptQuestion,
} from "../render.ts";

export async function handleTask(
  ctx: Context,
  intent: IntentTask,
  question: QuestionFn,
): Promise<void> {
  const branch = `${ctx.userName}/${intent.branchName}`;
  renderTask(intent.task, branch);

  const confirm = (await question(promptQuestion("Proceed? (Y/n) "))).trim().toLowerCase();
  if (confirm === "n") {
    logAction("task_cancelled");
    renderCancelled();
    return;
  }

  const reusable = findReusableFolder(ctx.cwd);
  let targetDir: string;
  if (reusable) {
    targetDir = reusable;
    renderReuse(reusable);
  } else {
    renderDuplicating();
    const envFiles = findEnvFiles(ctx.cwd);
    targetDir = duplicateFolder(ctx.cwd, envFiles);
    renderDuplicated(targetDir);
  }

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(intent.branchName, intent.task, targetDir);
  logAction(`tab_created dir=${targetDir} branch=${branch}`);
  renderTabCreated();
}
