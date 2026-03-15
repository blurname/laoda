import type { IntentListPr } from "../llm.ts";
import type { Context, QuestionFn } from "../types.ts";
import type { PrInfo } from "../github.ts";
import { getRepoSlug, listPrsForReview, listPrsByAuthor } from "../github.ts";
import {
  renderInfo,
  renderSuccess,
  renderError,
  renderFetching,
  promptQuestion,
} from "../render.ts";
import { handlePr } from "./pr.ts";

function renderPrList(prs: PrInfo[]): void {
  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i]!;
    console.log(`  ${i + 1}. #${pr.number} ${pr.title} (${pr.author})`);
  }
}

export async function handleListPr(
  ctx: Context,
  intent: IntentListPr,
  question: QuestionFn,
): Promise<Context> {
  const slug = getRepoSlug(ctx.cwd);
  if (!slug) {
    renderError("Cannot detect GitHub repo from git remote");
    return ctx;
  }

  const isMe = intent.target === "me";
  renderFetching(
    isMe ? "Fetching PRs requesting your review..." : `Fetching PRs by ${intent.target}...`,
  );

  let prs: PrInfo[];
  try {
    prs = isMe ? listPrsForReview(slug, ctx.cwd) : listPrsByAuthor(slug, intent.target, ctx.cwd);
  } catch (e: unknown) {
    renderError(`Failed to fetch PRs: ${e instanceof Error ? e.message : String(e)}`);
    return ctx;
  }

  if (prs.length === 0) {
    renderInfo(isMe ? "No PRs requesting your review" : `No open PRs by ${intent.target}`);
    return ctx;
  }

  renderSuccess(`${prs.length} PR(s) found:`);
  console.log();
  renderPrList(prs);
  console.log(`  0. Cancel`);
  console.log();

  const pick = (await question(promptQuestion("Pick a PR: "))).trim();
  const idx = parseInt(pick);

  if (!pick || idx === 0 || isNaN(idx) || idx < 1 || idx > prs.length) {
    renderInfo("Cancelled");
    return ctx;
  }

  const selected = prs[idx - 1]!;
  ctx.logAction(`list_pr_selected pr=${selected.number}`);
  return handlePr(ctx, selected, question);
}
