import { existsSync } from "fs";
import { copyFolder } from "@laoda/capability";
import { spawnTab } from "../zellij.ts";
import { findEnvFiles, prepareGitBranch } from "../git.ts";
import { logAction } from "../logger.ts";
import type { IntentReview } from "../llm.ts";
import type { Context, QuestionFn } from "../types.ts";
import { findOtherWorker, workerDir, addWorker, saveRegistry } from "../worker.ts";
import {
  renderDuplicating,
  renderDuplicated,
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  renderCancelled,
  renderInfo,
  renderSuccess,
  promptQuestion,
} from "../render.ts";

export async function handleReview(
  ctx: Context,
  intent: IntentReview,
  question: QuestionFn,
): Promise<Context> {
  const worker = findOtherWorker(ctx.registry, intent.workerName);
  const role = intent.workerRole ?? "designer";
  const needsRegister = !worker;
  const targetDir = workerDir(
    ctx.cwd,
    ctx.project,
    worker ?? { type: "other", name: intent.workerName, userType: role },
  );
  const needsDuplicate = !existsSync(targetDir);
  const branch = `${ctx.userName}/review-${intent.workerName}-${intent.branchName}`;

  // ── Plan ──
  console.log();
  const steps: string[] = [];
  if (needsRegister) {
    steps.push(`Register "${intent.workerName}" as ${role}`);
  }
  if (needsDuplicate) {
    steps.push(`Duplicate ${ctx.cwd} → ${targetDir}`);
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
    logAction("review_cancelled");
    renderCancelled();
    return ctx;
  }

  // ── Execute ──
  let currentCtx = ctx;

  if (needsRegister) {
    const newWorker = { type: "other" as const, name: intent.workerName, userType: role };
    const newRegistry = addWorker(ctx.registry, newWorker);
    saveRegistry(newRegistry);
    logAction(`worker_auto_added name=${intent.workerName} userType=${role}`);
    renderSuccess(`Registered ${intent.workerName} (${role})`);
    currentCtx = { ...ctx, registry: newRegistry };
  }

  if (needsDuplicate) {
    renderDuplicating();
    const envFiles = findEnvFiles(currentCtx.cwd);
    copyFolder(currentCtx.cwd, targetDir, envFiles);
    renderDuplicated(targetDir);
  }

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(`review-${intent.workerName}`, intent.task, targetDir);
  logAction(`review_tab dir=${targetDir} branch=${branch} worker=${intent.workerName}`);
  renderTabCreated();
  return currentCtx;
}
