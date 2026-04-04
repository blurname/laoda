import type { PrInfo } from "../infra/github.ts";
import type { Context, QuestionFn } from "../types.ts";
import { emit } from "../ui/core/bridge/message-sink.ts";
import {
  renderCancelled,
  renderSuccess,
  renderInfo,
  renderFlowError,
  promptQuestion,
} from "../render.ts";
import { sanitizeBranchName } from "../llm/classify.ts";
import { getAuthorWorkType, getAuthorRole, saveAuthor } from "../infra/authors.ts";
import { taskFlow, reviewFlow } from "../flow/flows.ts";
import type { FlowResult } from "../flow/engine.ts";

function handleFlowResult(ctx: Context, result: FlowResult<unknown>): Context {
  if (!result.ok) {
    renderFlowError(result.error);
    return result.ctx;
  }
  return result.ctx;
}

export async function handlePr(ctx: Context, pr: PrInfo, question: QuestionFn): Promise<Context> {
  renderSuccess(`PR #${pr.number}: ${pr.title}`);
  renderInfo(`  by ${pr.author} → ${pr.branch}`);

  const defaultType = getAuthorWorkType(pr.author, ctx.userName);
  const isMy = defaultType === "my";

  emit("raw", "");
  emit("raw", `  1. ${isMy ? "My work" : "Review other's work"} (default)`);
  emit("raw", `  2. ${isMy ? "Review other's work" : "My work"}`);
  emit("raw", "  3. Cancel");

  const pick = (await question(promptQuestion("Pick (1): "))).trim() || "1";

  const isOverride = pick === "2";
  const chosenMy = (pick === "1" && isMy) || (pick === "2" && !isMy);

  if (pick === "3") {
    renderCancelled();
    return ctx;
  }

  if (chosenMy) {
    if (isOverride) {
      saveAuthor(pr.author, { workType: "my" });
      renderSuccess(`Saved: ${pr.author} → my work`);
    }
    ctx.logAction(`pr_as_task pr=${pr.number}`);
    const result = await taskFlow.run(
      ctx,
      {
        task: `Review PR #${pr.number}: ${pr.title}`,
        branchName: sanitizeBranchName(`pr-${pr.number}-${pr.branch}`),
        userName: ctx.userName,
      },
      question,
    );
    return handleFlowResult(ctx, result);
  } else {
    let role = getAuthorRole(pr.author);
    if (isOverride) {
      emit("raw", "");
      emit("raw", "  1. designer");
      emit("raw", "  2. product");
      const rolePick =
        (await question(promptQuestion(`Role for ${pr.author} (1): `))).trim() || "1";
      role = rolePick === "2" ? "product" : "designer";
      saveAuthor(pr.author, { workType: "other", workerRole: role });
      renderSuccess(`Saved: ${pr.author} → ${role}`);
    }
    ctx.logAction(`pr_as_review pr=${pr.number} author=${pr.author}`);
    const result = await reviewFlow.run(
      ctx,
      {
        workerName: pr.author,
        workerRole: role,
        task: `Review PR #${pr.number}: ${pr.title}`,
        branchName: sanitizeBranchName(`pr-${pr.number}-${pr.branch}`),
        userName: ctx.userName,
      },
      question,
    );
    return handleFlowResult(ctx, result);
  }
}
