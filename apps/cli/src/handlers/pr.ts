import { spawnTab } from "../zellij.ts";
import { logAction } from "../logger.ts";
import type { PrInfo } from "../github.ts";
import type { Context, QuestionFn } from "../types.ts";
import {
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  renderCancelled,
  renderInfo,
  renderSuccess,
  promptQuestion,
} from "../render.ts";
import { execSync } from "child_process";

export async function handlePr(
  ctx: Context,
  pr: PrInfo,
  question: QuestionFn,
): Promise<Context> {
  // ── Plan ──
  console.log();
  const steps: string[] = [
    `Fetch PR #${pr.number}: ${pr.title}`,
    `Checkout branch ${pr.branch}`,
    `Open tab: claude (no initial prompt)`,
  ];

  renderInfo("Plan:");
  for (const step of steps) {
    console.log(`    ${step}`);
  }
  console.log();

  const confirm = (await question(promptQuestion("Execute? (Y/n) "))).trim().toLowerCase();
  if (confirm === "n") {
    logAction("pr_review_cancelled");
    renderCancelled();
    return ctx;
  }

  // ── Execute ──
  renderPreparingBranch(pr.branch);
  try {
    execSync(`gh pr checkout ${pr.number}`, {
      cwd: ctx.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    execSync(`git checkout ${pr.branch}`, {
      cwd: ctx.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  renderBranchReady(pr.branch);

  renderSuccess(`PR #${pr.number}: ${pr.title} (by ${pr.author})`);

  spawnTab(`pr-${pr.number}`, "", ctx.cwd);
  logAction(`pr_tab pr=${pr.number} branch=${pr.branch} author=${pr.author}`);
  renderTabCreated();
  return ctx;
}
