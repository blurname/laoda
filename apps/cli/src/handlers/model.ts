import { setModel, loadModelsCache } from "../config.ts";
import { logAction } from "../logger.ts";
import type { IntentChangeModel } from "../llm.ts";
import type { QuestionFn } from "../types.ts";
import {
  renderInfo,
  renderSuccess,
  renderCancelled,
  renderModelOption,
  promptQuestion,
} from "../render.ts";

export async function handleChangeModel(
  intent: IntentChangeModel,
  question: QuestionFn,
): Promise<void> {
  let q = intent.query.trim().toLowerCase();
  if (!q) {
    q = (await question(promptQuestion("Search model: "))).trim().toLowerCase();
    if (!q) return;
  }

  const cached = loadModelsCache();
  const matches = cached
    .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    .slice(0, 10);

  if (matches.length === 0) {
    renderInfo(`No models matching "${intent.query}"`);
    return;
  }

  console.log();
  for (let i = 0; i < matches.length; i++) {
    renderModelOption(i + 1, matches[i]!.id, matches[i]!.name);
  }

  const pick = (await question(promptQuestion("Pick number (enter to cancel): "))).trim();
  const idx = parseInt(pick) - 1;
  if (idx >= 0 && idx < matches.length) {
    setModel(matches[idx]!.id);
    logAction(`model_changed to=${matches[idx]!.id}`);
    renderSuccess(`Model set to ${matches[idx]!.id}`);
  } else {
    renderCancelled();
  }
}
