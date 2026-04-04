import { setModel, loadModelsCache } from "../infra/config.ts";
import type { IntentChangeModel } from "../llm/classify.ts";
import type { Context, QuestionFn } from "../types.ts";
import { emit } from "@laoda/ui-core/src/bridge/message-sink.ts";
import {
  renderInfo,
  renderSuccess,
  renderCancelled,
  renderModelOption,
  promptQuestion,
} from "../render.ts";

export async function handleChangeModel(
  ctx: Context,
  intent: IntentChangeModel,
  question: QuestionFn,
): Promise<Context> {
  let q = intent.query.trim().toLowerCase();
  if (!q) {
    q = (await question(promptQuestion("Search model: "))).trim().toLowerCase();
    if (!q) return ctx;
  }

  const cached = loadModelsCache();
  const matches = cached
    .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    .slice(0, 10);

  if (matches.length === 0) {
    renderInfo(`No models matching "${intent.query}"`);
    return ctx;
  }

  emit("raw", "");
  for (let i = 0; i < matches.length; i++) {
    renderModelOption(i + 1, matches[i]!.id, matches[i]!.name);
  }

  const pick = (await question(promptQuestion("Pick number (enter to cancel): "))).trim();
  const idx = parseInt(pick) - 1;
  if (idx >= 0 && idx < matches.length) {
    setModel(matches[idx]!.id);
    ctx.logAction(`model_changed to=${matches[idx]!.id}`);
    renderSuccess(`Model set to ${matches[idx]!.id}`);
  } else {
    renderCancelled();
  }
  return ctx;
}
