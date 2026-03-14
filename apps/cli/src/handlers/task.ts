import { spawnTab } from "../zellij.ts";
import { findEnvFiles, prepareGitBranch } from "../git.ts";
import { duplicateFolder } from "@laoda/capability";
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
  renderReuse,
  renderDuplicating,
  renderDuplicated,
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  renderCancelled,
  renderInfo,
  promptQuestion,
} from "../render.ts";

export async function handleTask(
  ctx: Context,
  intent: IntentTask,
  question: QuestionFn,
): Promise<Context> {
  const branch = `${ctx.userName}/${intent.branchName}`;
  const alloc = allocateMyWorker(ctx.cwd, ctx.registry);

  // ── Plan ──
  console.log();
  const steps: string[] = [];
  if (alloc.action === "reuse") {
    steps.push(`Reuse worker-${alloc.worker.index} (${alloc.path})`);
  } else {
    steps.push(`Create worker-${alloc.index} (duplicate folder)`);
  }
  steps.push(`Create branch ${branch}`);
  steps.push(`Open tab: claude "${intent.task}"`);

  renderInfo("Plan:");
  for (const step of steps) {
    console.log(`    ${step}`);
  }
  console.log();

  const confirm = (await question(promptQuestion("Execute? (Y/n) "))).trim().toLowerCase();
  if (confirm === "n") {
    ctx.logAction("task_cancelled");
    renderCancelled();
    return ctx;
  }

  // ── Execute ──
  let targetDir: string;
  let newRegistry: typeof ctx.registry;

  if (alloc.action === "reuse") {
    targetDir = alloc.path;
    renderReuse(targetDir);
    const busyWorker = makeWorkerBusy(alloc.worker, intent.task, branch);
    const original = ctx.registry.workers.find(
      (w) => w.type === "my" && w.index === alloc.worker.index,
    );
    newRegistry = original ? replaceWorker(ctx.registry, original, busyWorker) : ctx.registry;
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
    newRegistry = addWorker(ctx.registry, newWorker);
  }

  saveRegistry(newRegistry);

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(intent.branchName, intent.task, targetDir);
  ctx.logAction(`tab_created dir=${targetDir} branch=${branch}`);
  renderTabCreated();

  return { ...ctx, registry: newRegistry };
}
