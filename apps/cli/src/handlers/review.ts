import { spawnTab } from "../zellij.ts";
import { prepareGitBranch } from "../git.ts";
import { logAction } from "../logger.ts";
import type { IntentReview } from "../llm.ts";
import type { Context, QuestionFn } from "../types.ts";
import { findOtherWorker, workerDir } from "../worker.ts";
import {
  renderTask,
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  renderCancelled,
  renderError,
  promptQuestion,
} from "../render.ts";

export async function handleReview(
  ctx: Context,
  intent: IntentReview,
  question: QuestionFn,
): Promise<void> {
  const worker = findOtherWorker(ctx.registry, intent.workerName);
  if (!worker) {
    renderError(`Unknown worker "${intent.workerName}"`);
    return;
  }

  const targetDir = workerDir(ctx.cwd, ctx.project, worker);
  const branch = `${ctx.userName}/review-${intent.workerName}-${intent.branchName}`;

  renderTask(`Review ${worker.name} (${worker.userType}): ${intent.task}`, branch);

  const confirm = (await question(promptQuestion("Proceed? (Y/n) "))).trim().toLowerCase();
  if (confirm === "n") {
    logAction("review_cancelled");
    renderCancelled();
    return;
  }

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(`review-${intent.workerName}`, intent.task, targetDir);
  logAction(`review_tab dir=${targetDir} branch=${branch} worker=${intent.workerName}`);
  renderTabCreated();
}
