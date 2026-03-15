import type { IntentListPr } from "./llm.ts";

export function parsePrShortcut(input: string): IntentListPr | null {
  const lower = input.toLowerCase().trim();
  // "pr" / "get pr" / "my pr" → list PRs requesting my review
  if (/^(get\s+)?pr$/.test(lower) || /^my\s+pr$/.test(lower)) {
    return { type: "list_pr", target: "me" };
  }
  // "review xxx pr" / "review xxx 的 pr" / "xxx 的 pr" / "xxx pr"
  const reviewMatch = input.match(/(?:review\s+)?(\S+?)(?:\s*的)?\s*pr$/i);
  if (reviewMatch && reviewMatch[1] && !/^(get|my)$/i.test(reviewMatch[1])) {
    return { type: "list_pr", target: reviewMatch[1] };
  }
  return null;
}
