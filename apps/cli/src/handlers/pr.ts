import { logAction } from "../logger.ts";
import type { PrInfo } from "../github.ts";
import type { IntentTask, IntentReview } from "../llm.ts";
import type { Context, QuestionFn } from "../types.ts";
import { renderCancelled, renderSuccess, renderInfo, promptQuestion } from "../render.ts";
import { handleTask } from "./task.ts";
import { handleReview } from "./review.ts";
import { sanitizeBranchName } from "../llm.ts";

export async function handlePr(
  ctx: Context,
  pr: PrInfo,
  question: QuestionFn,
): Promise<Context> {
  renderSuccess(`PR #${pr.number}: ${pr.title}`);
  renderInfo(`  by ${pr.author} → ${pr.branch}`);

  console.log();
  console.log("  1. My work (use numbered worker slot)");
  console.log("  2. Review other's work (use named worker slot)");
  console.log("  3. Cancel");

  const pick = (await question(promptQuestion("Pick: "))).trim();

  if (pick === "1") {
    const intent: IntentTask = {
      type: "task",
      task: `Review PR #${pr.number}: ${pr.title}`,
      branchName: sanitizeBranchName(`pr-${pr.number}-${pr.branch}`),
    };
    logAction(`pr_as_task pr=${pr.number}`);
    return handleTask(ctx, intent, question);
  } else if (pick === "2") {
    const intent: IntentReview = {
      type: "review",
      workerName: pr.author,
      workerRole: "designer",
      task: `Review PR #${pr.number}: ${pr.title}`,
      branchName: sanitizeBranchName(`pr-${pr.number}-${pr.branch}`),
    };
    logAction(`pr_as_review pr=${pr.number} author=${pr.author}`);
    return handleReview(ctx, intent, question);
  } else {
    renderCancelled();
    return ctx;
  }
}
