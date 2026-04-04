import type { Context, UserType, QuestionFn } from "../types.ts";
import {
  saveRegistry,
  scanSiblingFolders,
  findUnregistered,
  findOtherWorker,
  getOtherWorkerNames,
  addWorker as addWorkerToRegistry,
  removeWorkerByName,
} from "../infra/worker.ts";
import { emit } from "@laoda/ui-core/src/bridge/message-sink.ts";
import { renderInfo, renderSuccess, renderCancelled, promptQuestion } from "../render.ts";

export async function handleManageWorkers(ctx: Context, question: QuestionFn): Promise<Context> {
  const otherNames = getOtherWorkerNames(ctx.registry);
  const physicalFolders = scanSiblingFolders(ctx.cwd, ctx.project);
  const unregistered = findUnregistered(ctx.registry, physicalFolders).filter(
    (u) => !/^\d+$/.test(u),
  );

  emit("raw", "");
  if (otherNames.length > 0) {
    renderSuccess(`Registered: ${otherNames.join(", ")}`);
  } else {
    renderInfo("No workers registered");
  }
  if (unregistered.length > 0) {
    renderInfo(`Unregistered folders: ${unregistered.join(", ")}`);
  }

  emit("raw", "");
  emit("raw", "  1. Add worker");
  emit("raw", "  2. Remove worker");
  emit("raw", "  3. Cancel");

  const pick = (await question(promptQuestion("Pick: "))).trim();

  if (pick === "1") {
    return handleAddWorker(ctx, question);
  } else if (pick === "2") {
    return handleRemoveWorker(ctx, otherNames, question);
  } else {
    renderCancelled();
    return ctx;
  }
}

async function handleAddWorker(ctx: Context, question: QuestionFn): Promise<Context> {
  const name = (await question(promptQuestion("Worker name (lowercase): "))).trim().toLowerCase();
  if (!name) return ctx;

  const existing = findOtherWorker(ctx.registry, name);
  if (existing) {
    renderInfo(`"${name}" already registered as ${existing.userType}`);
    return ctx;
  }

  emit("raw", "  1. designer");
  emit("raw", "  2. product");
  const typePick = (await question(promptQuestion("Type: "))).trim();
  const userType: UserType = typePick === "2" ? "product" : "designer";

  const newRegistry = addWorkerToRegistry(ctx.registry, { type: "other", name, userType });
  saveRegistry(newRegistry);
  ctx.logAction(`worker_added name=${name} userType=${userType}`);
  renderSuccess(`Added ${name} (${userType})`);
  return { ...ctx, registry: newRegistry };
}

async function handleRemoveWorker(
  ctx: Context,
  otherNames: string[],
  question: QuestionFn,
): Promise<Context> {
  if (otherNames.length === 0) {
    renderInfo("No workers to remove");
    return ctx;
  }

  emit("raw", "");
  for (let i = 0; i < otherNames.length; i++) {
    const w = findOtherWorker(ctx.registry, otherNames[i]!);
    emit("raw", `  ${i + 1}. ${otherNames[i]} (${w?.userType})`);
  }

  const idx = parseInt((await question(promptQuestion("Pick number to remove: "))).trim()) - 1;
  if (idx < 0 || idx >= otherNames.length) {
    renderCancelled();
    return ctx;
  }

  const removeName = otherNames[idx]!;
  const newRegistry = removeWorkerByName(ctx.registry, removeName);
  saveRegistry(newRegistry);
  ctx.logAction(`worker_removed name=${removeName}`);
  renderSuccess(`Removed ${removeName}`);
  return { ...ctx, registry: newRegistry };
}
