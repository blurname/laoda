import { createInterface } from "readline";
import { spawnTab } from "./src/zellij.ts";
import { findReusableFolder, getProjectName } from "./src/workspace.ts";
import { findEnvFiles, prepareGitBranch } from "./src/git.ts";
import { duplicateFolder } from "@laoda/capability";
import {
  getName,
  setName,
  getOpenRouterKey,
  setOpenRouterKey,
  getModel,
  setModel,
  isModelsCacheStale,
  saveModelsCache,
  loadModelsCache,
} from "./src/config.ts";
import type { IntentTask, IntentChangeModel, IntentReview } from "./src/llm.ts";
import { classifyIntent, classifyUnregistered, fetchModels } from "./src/llm.ts";
import { setLogProject, logUserInput, logIntent, logAction, logError } from "./src/logger.ts";
import { setMemoProject, memoLookup, memoSave } from "./src/memo.ts";
import type { Context } from "./src/types.ts";
import {
  loadRegistry,
  saveRegistry,
  scanSiblingFolders,
  findUnregistered,
  reconcileRegistry,
  findOtherWorker,
  workerDir,
  getOtherWorkerNames,
} from "./src/worker.ts";
import {
  renderBanner,
  renderProject,
  renderUser,
  renderModel,
  renderCached,
  renderThinking,
  renderTask,
  renderReuse,
  renderDuplicating,
  renderDuplicated,
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  renderCancelled,
  renderInfo,
  renderError,
  renderSuccess,
  renderFetching,
  renderModelOption,
  promptPrefix,
  promptQuestion,
} from "./src/render.ts";

export function runCli(): void {
  renderBanner();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const cwd = process.cwd();
  const project = getProjectName(cwd);
  setLogProject(project);
  setMemoProject(project);
  const registry = loadRegistry(project);
  const ctx: Context = { cwd, userName: "", project, registry };

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

  async function setup(): Promise<void> {
    renderProject(ctx.project);

    const savedName = getName();
    if (savedName) {
      ctx.userName = savedName;
      renderUser(savedName);
    } else {
      console.log();
      while (!ctx.userName) {
        const name = (await question(promptQuestion("Your name (for branch prefix): "))).trim();
        if (name) {
          ctx.userName = name;
          setName(name);
        }
      }
    }

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

    // Reconcile worker registry with physical folders
    const physicalFolders = scanSiblingFolders(ctx.cwd, ctx.project);
    const unregistered = findUnregistered(ctx.registry, physicalFolders);
    const unregisteredNamed = unregistered.filter((u) => !/^\d+$/.test(u));
    if (unregisteredNamed.length > 0) {
      renderFetching(`Classifying ${unregisteredNamed.length} new worker(s)...`);
      const classified = await classifyUnregistered(unregisteredNamed);
      ctx.registry = reconcileRegistry(ctx.registry, ctx.cwd, classified);
      saveRegistry(ctx.registry);
      renderSuccess(`Workers synced (${ctx.registry.workers.length} total)`);
    } else if (unregistered.length > 0) {
      ctx.registry = reconcileRegistry(ctx.registry, ctx.cwd, []);
      saveRegistry(ctx.registry);
    }

    const otherNames = getOtherWorkerNames(ctx.registry);
    if (otherNames.length > 0) {
      renderSuccess(`Team: ${otherNames.join(", ")}`);
    }

    renderModel(getModel());
    loop();
  }

  async function loop(): Promise<void> {
    console.log();
    const input = (await question(promptPrefix())).trim();
    if (!input) {
      loop();
      return;
    }

    logUserInput(input);
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
        await handleTask(ctx, intent, question);
      } else if (intent.type === "review") {
        await handleReview(ctx, intent, question);
      } else if (intent.type === "change_model") {
        await handleChangeModel(intent, question);
      } else {
        renderInfo(intent.message);
      }
    } catch (e: any) {
      logError(e.message);
      renderError(e.message);
    }

    loop();
  }

  setup();
}

async function handleTask(
  ctx: Context,
  intent: IntentTask,
  question: (prompt: string) => Promise<string>,
): Promise<void> {
  const branch = `${ctx.userName}/${intent.branchName}`;
  renderTask(intent.task, branch);

  const confirm = (await question(promptQuestion("Proceed? (Y/n) "))).trim().toLowerCase();
  if (confirm === "n") {
    logAction("task_cancelled");
    renderCancelled();
    return;
  }

  const reusable = findReusableFolder(ctx.cwd);
  let targetDir: string;
  if (reusable) {
    targetDir = reusable;
    renderReuse(reusable);
  } else {
    renderDuplicating();
    const envFiles = findEnvFiles(ctx.cwd);
    targetDir = duplicateFolder(ctx.cwd, envFiles);
    renderDuplicated(targetDir);
  }

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(intent.branchName, intent.task, targetDir);
  logAction(`tab_created dir=${targetDir} branch=${branch}`);
  renderTabCreated();
}

async function handleChangeModel(
  intent: IntentChangeModel,
  question: (prompt: string) => Promise<string>,
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

async function handleReview(
  ctx: Context,
  intent: IntentReview,
  question: (prompt: string) => Promise<string>,
): Promise<void> {
  const worker = findOtherWorker(ctx.registry, intent.workerName);
  if (!worker) {
    renderError(`Unknown worker "${intent.workerName}"`);
    return;
  }

  const targetDir = workerDir(ctx.cwd, ctx.project, worker);
  const branch = `${ctx.userName}/review-${intent.workerName}-${intent.branchName}`;

  renderTask(`Review ${worker.name} (${worker.userType}): ${intent.task}`, branch);

  const confirm = (await question(promptQuestion("Proceed? (Y/n) "))).trim().toLowerCase();
  if (confirm === "n") {
    logAction("review_cancelled");
    renderCancelled();
    return;
  }

  renderPreparingBranch(branch);
  prepareGitBranch(targetDir, branch);
  renderBranchReady(branch);

  spawnTab(`review-${intent.workerName}`, intent.task, targetDir);
  logAction(`review_tab dir=${targetDir} branch=${branch} worker=${intent.workerName}`);
  renderTabCreated();
}
