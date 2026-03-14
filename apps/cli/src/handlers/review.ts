import { existsSync } from "fs";
import { copyFolder } from "@laoda/capability";
import { spawnTab } from "../zellij.ts";
import { findEnvFiles, prepareGitBranch } from "../git.ts";
import { logAction } from "../logger.ts";
import type { IntentReview } from "../llm.ts";
import type { Context, QuestionFn } from "../types.ts";
import { findOtherWorker, workerDir, addWorker, saveRegistry } from "../worker.ts";
import {
  renderTask,
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  renderCancelled,
  renderDuplicating,
  renderDuplicated,
  renderInfo,
  renderSuccess,
  promptQuestion,
} from "../render.ts";

export async function handleReview(
  ctx: Context,
  intent: IntentReview,
  question: QuestionFn,
): Promise<Context> {
  let currentCtx = ctx;
  let worker = findOtherWorker(ctx.registry, intent.workerName);
  const role = intent.workerRole ?? "designer";

  if (!worker) {
    renderInfo(`"${intent.workerName}" is not registered. Register as ${role}?`);
    const confirm = (await question(promptQuestion("(Y/n) "))).trim().toLowerCase();
    if (confirm === "n") {
      renderCancelled();
      return ctx;
    }
    const newWorker = {
      type: "other" as const,
      name: intent.workerName,
      userType: role,
    };
    const newRegistry = addWorker(ctx.registry, newWorker);
    saveRegistry(newRegistry);
    logAction(`worker_auto_added name=${intent.workerName} userType=${role}`);
    renderSuccess(`Registered ${intent.workerName} (${role})`);
    currentCtx = { ...ctx, registry: newRegistry };
    worker = newWorker;
  }

  const targetDir = workerDir(currentCtx.cwd, currentCtx.project, worker);

  if (!existsSync(targetDir)) {
    renderDuplicating();
    const envFiles = findEnvFiles(currentCtx.cwd);
    copyFolder(currentCtx.cwd, targetDir, envFiles);
    renderDuplicated(targetDir);
  }

  const branch = `${currentCtx.userName}/review-${intent.workerName}-${intent.branchName}`;

  renderTask(`Review ${worker.name} (${worker.userType}): ${intent.task}`, branch);

  const confirm = (await question(promptQuestion("Proceed? (Y/n) "))).trim().toLowerCase();
  if (confirm === "n") {
    logAction("review_cancelled");
    renderCancelled();
    return currentCtx;
  }

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(`review-${intent.workerName}`, intent.task, targetDir);
  logAction(`review_tab dir=${targetDir} branch=${branch} worker=${intent.workerName}`);
  renderTabCreated();
  return currentCtx;
}
