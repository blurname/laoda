import { createInterface } from "readline";
import { getProjectName } from "./src/workspace.ts";
import {
  getName,
  setName,
  getOpenRouterKey,
  setOpenRouterKey,
  getModel,
  isModelsCacheStale,
  saveModelsCache,
} from "./src/config.ts";
import { classifyIntent, fetchModels } from "./src/llm.ts";
import { setLogProject, logUserInput, logIntent, logError } from "./src/logger.ts";
import { setMemoProject, memoLookup, memoSave } from "./src/memo.ts";
import type { Context } from "./src/types.ts";
import {
  loadRegistry,
  scanSiblingFolders,
  findUnregistered,
  getOtherWorkerNames,
  resolveWorkerFolders,
} from "./src/worker.ts";
import {
  renderBanner,
  renderProject,
  renderUser,
  renderModel,
  renderCached,
  renderThinking,
  renderInfo,
  renderError,
  renderSuccess,
  renderFetching,
  promptPrefix,
  promptQuestion,
} from "./src/render.ts";
import { handleTask } from "./src/handlers/task.ts";
import { handleReview } from "./src/handlers/review.ts";
import { handleChangeModel } from "./src/handlers/model.ts";
import { handleManageWorkers } from "./src/handlers/workers.ts";

export function runCli(): void {
  renderBanner();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const cwd = process.cwd();
  const project = getProjectName(cwd);
  setLogProject(project);
  setMemoProject(project);
  const registry = loadRegistry(project);

  rl.on("SIGINT", () => {
    process.stdout.write("\n");
  });

  rl.on("close", () => {
    console.log();
    process.exit(0);
  });

  function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  async function askUserName(): Promise<string> {
    const savedName = getName();
    if (savedName) {
      renderUser(savedName);
      return savedName;
    }
    console.log();
    let name = "";
    while (!name) {
      name = (await question(promptQuestion("Your name (for branch prefix): "))).trim();
    }
    setName(name);
    return name;
  }

  async function setup(): Promise<void> {
    renderProject(project);

    const userName = await askUserName();
    const ctx: Context = { cwd, userName, project, registry };

    if (!getOpenRouterKey()) {
      console.log();
      let key = "";
      while (!key) {
        key = (await question(promptQuestion("OpenRouter API key: "))).trim();
      }
      setOpenRouterKey(key);
      renderSuccess("Key saved");
    }

    if (isModelsCacheStale()) {
      renderFetching("Fetching models...");
      try {
        const models = await fetchModels();
        const simplified = models.map((m) => ({ id: m.id, name: m.name }));
        saveModelsCache(simplified);
        renderSuccess(`${simplified.length} models cached`);
      } catch (e: any) {
        renderInfo(`Failed to fetch models: ${e.message}`);
      }
    }

    // Lightweight worker check
    const workerFolders = resolveWorkerFolders(ctx.cwd, ctx.registry);
    const missing = workerFolders.filter((wf) => !wf.exists && wf.worker.type === "other");
    for (const wf of missing) {
      if (wf.worker.type === "other") {
        renderInfo(`Worker "${wf.worker.name}" folder missing: ${wf.path}`);
      }
    }

    const physicalFolders = scanSiblingFolders(ctx.cwd, ctx.project);
    const unregistered = findUnregistered(ctx.registry, physicalFolders);
    const unregisteredNamed = unregistered.filter((u) => !/^\d+$/.test(u));
    if (unregisteredNamed.length > 0) {
      renderInfo(
        `Unregistered folders: ${unregisteredNamed.join(", ")} (say "manage workers" to register)`,
      );
    }

    const otherNames = getOtherWorkerNames(ctx.registry);
    if (otherNames.length > 0) {
      renderSuccess(`Team: ${otherNames.join(", ")}`);
    }

    renderModel(getModel());
    loop(ctx);
  }

  async function loop(ctx: Context): Promise<void> {
    console.log();
    const input = (await question(promptPrefix())).trim();
    if (!input) {
      loop(ctx);
      return;
    }

    logUserInput(input);
    let nextCtx = ctx;
    try {
      const cached = memoLookup(input);
      let intent;
      if (cached) {
        intent = cached;
        renderCached();
      } else {
        renderThinking();
        intent = await classifyIntent(input, getOtherWorkerNames(ctx.registry));
        memoSave(input, intent);
      }
      logIntent(intent);

      if (intent.type === "task") {
        nextCtx = await handleTask(ctx, intent, question);
      } else if (intent.type === "review") {
        await handleReview(ctx, intent, question);
      } else if (intent.type === "manage_workers") {
        nextCtx = await handleManageWorkers(ctx, question);
      } else if (intent.type === "change_model") {
        await handleChangeModel(intent, question);
      } else {
        renderInfo(intent.message);
      }
    } catch (e: any) {
      logError(e.message);
      renderError(e.message);
    }

    loop(nextCtx);
  }

  setup();
}
