import { logAction } from "../logger.ts";
import type { Context, UserType, QuestionFn } from "../types.ts";
import {
  saveRegistry,
  scanSiblingFolders,
  findUnregistered,
  findOtherWorker,
  getOtherWorkerNames,
} from "../worker.ts";
import { renderInfo, renderSuccess, renderCancelled, promptQuestion } from "../render.ts";

export async function handleManageWorkers(ctx: Context, question: QuestionFn): Promise<void> {
  const otherNames = getOtherWorkerNames(ctx.registry);
  const physicalFolders = scanSiblingFolders(ctx.cwd, ctx.project);
  const unregistered = findUnregistered(ctx.registry, physicalFolders).filter(
    (u) => !/^\d+$/.test(u),
  );

  console.log();
  if (otherNames.length > 0) {
    renderSuccess(`Registered: ${otherNames.join(", ")}`);
  } else {
    renderInfo("No workers registered");
  }
  if (unregistered.length > 0) {
    renderInfo(`Unregistered folders: ${unregistered.join(", ")}`);
  }

  console.log();
  console.log("  1. Add worker");
  console.log("  2. Remove worker");
  console.log("  3. Cancel");

  const pick = (await question(promptQuestion("Pick: "))).trim();

  if (pick === "1") {
    await addWorker(ctx, question);
  } else if (pick === "2") {
    await removeWorker(ctx, otherNames, question);
  } else {
    renderCancelled();
  }
}

async function addWorker(ctx: Context, question: QuestionFn): Promise<void> {
  const name = (await question(promptQuestion("Worker name (lowercase): "))).trim().toLowerCase();
  if (!name) return;

  const existing = findOtherWorker(ctx.registry, name);
  if (existing) {
    renderInfo(`"${name}" already registered as ${existing.userType}`);
    return;
  }

  console.log("  1. designer");
  console.log("  2. product");
  const typePick = (await question(promptQuestion("Type: "))).trim();
  const userType: UserType = typePick === "2" ? "product" : "designer";

  ctx.registry.workers.push({ type: "other", name, userType });
  saveRegistry(ctx.registry);
  logAction(`worker_added name=${name} userType=${userType}`);
  renderSuccess(`Added ${name} (${userType})`);
}

async function removeWorker(
  ctx: Context,
  otherNames: string[],
  question: QuestionFn,
): Promise<void> {
  if (otherNames.length === 0) {
    renderInfo("No workers to remove");
    return;
  }

  console.log();
  for (let i = 0; i < otherNames.length; i++) {
    const w = findOtherWorker(ctx.registry, otherNames[i]!);
    console.log(`  ${i + 1}. ${otherNames[i]} (${w?.userType})`);
  }

  const idx = parseInt((await question(promptQuestion("Pick number to remove: "))).trim()) - 1;
  if (idx < 0 || idx >= otherNames.length) {
    renderCancelled();
    return;
  }

  const removeName = otherNames[idx]!;
  ctx.registry.workers = ctx.registry.workers.filter(
    (w) => !(w.type === "other" && w.name === removeName),
  );
  saveRegistry(ctx.registry);
  logAction(`worker_removed name=${removeName}`);
  renderSuccess(`Removed ${removeName}`);
}
