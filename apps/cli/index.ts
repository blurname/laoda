import { createInterface } from "readline";
import { spawnTab } from "./src/zellij.ts";
import { findReusableFolder } from "./src/workspace.ts";
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
import type { IntentTask, IntentChangeModel } from "./src/llm.ts";
import { classifyIntent, fetchModels } from "./src/llm.ts";
import { logUserInput, logIntent, logAction, logError } from "./src/logger.ts";
import { memoLookup, memoSave } from "./src/memo.ts";
import type { Context } from "./src/types.ts";
import {
  renderBanner,
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
  const ctx: Context = { cwd: process.cwd(), userName: "" };

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
        intent = await classifyIntent(input);
        memoSave(input, intent);
      }
      logIntent(intent);

      if (intent.type === "task") {
        await handleTask(ctx, intent, question);
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
