import type { PrInfo } from "../github.ts";
import type { Context, QuestionFn } from "../types.ts";
import { renderCancelled, renderSuccess, renderInfo, promptQuestion } from "../render.ts";
import { sanitizeBranchName } from "../llm.ts";
import { getAuthorWorkType, getAuthorRole, saveAuthor } from "../authors.ts";
import { taskFlow, reviewFlow } from "../flows.ts";

export async function handlePr(ctx: Context, pr: PrInfo, question: QuestionFn): Promise<Context> {
  renderSuccess(`PR #${pr.number}: ${pr.title}`);
  renderInfo(`  by ${pr.author} → ${pr.branch}`);

  const defaultType = getAuthorWorkType(pr.author, ctx.userName);
  const isMy = defaultType === "my";

  console.log();
  console.log(`  1. ${isMy ? "My work" : "Review other's work"} (default)`);
  console.log(`  2. ${isMy ? "Review other's work" : "My work"}`);
  console.log("  3. Cancel");

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
    return result.ctx;
  } else {
    let role = getAuthorRole(pr.author);
    if (isOverride) {
      console.log();
      console.log("  1. designer");
      console.log("  2. product");
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
    return result.ctx;
  }
}
