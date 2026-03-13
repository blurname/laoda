import { spawnTab } from "../zellij.ts";
import { findEnvFiles, prepareGitBranch } from "../git.ts";
import { duplicateFolder } from "@laoda/capability";
import { logAction } from "../logger.ts";
import type { IntentTask } from "../llm.ts";
import type { Context, QuestionFn } from "../types.ts";
import {
  allocateMyWorker,
  makeWorkerBusy,
  replaceWorker,
  addWorker,
  saveRegistry,
} from "../worker.ts";
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

  const alloc = allocateMyWorker(ctx.cwd, ctx.registry);
  let targetDir: string;

  if (alloc.action === "reuse") {
    targetDir = alloc.path;
    renderReuse(targetDir);
    const busyWorker = makeWorkerBusy(alloc.worker, intent.task, branch);
    // Find the original worker in registry (by index) to replace
    const original = ctx.registry.workers.find(
      (w) => w.type === "my" && w.index === alloc.worker.index,
    );
    ctx.registry = original ? replaceWorker(ctx.registry, original, busyWorker) : ctx.registry;
  } else {
    renderDuplicating();
    const envFiles = findEnvFiles(ctx.cwd);
    targetDir = duplicateFolder(ctx.cwd, envFiles);
    renderDuplicated(targetDir);

    const newWorker = {
      type: "my" as const,
      index: alloc.index,
      status: "busy" as const,
      task: intent.task,
      branch,
    };
    ctx.registry = addWorker(ctx.registry, newWorker);
  }

  saveRegistry(ctx.registry);

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(intent.branchName, intent.task, targetDir);
  logAction(`tab_created dir=${targetDir} branch=${branch}`);
  renderTabCreated();
}
