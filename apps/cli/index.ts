import { createInterface } from "readline";
import { Transform } from "stream";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getProjectName } from "./src/infra/workspace.ts";
import {
  getName,
  setName,
  getOpenRouterKey,
  setOpenRouterKey,
  getModel,
  getAgent,
  setAgent,
  isModelsCacheStale,
  saveModelsCache,
} from "./src/infra/config.ts";
import { classifyIntent, fetchModels } from "./src/llm/classify.ts";
import type { Intent } from "./src/llm/classify.ts";
import { Logger } from "./src/infra/logger.ts";
import { Memo } from "./src/llm/memo.ts";
import type { Context } from "./src/types.ts";
import {
  loadRegistry,
  scanSiblingFolders,
  findUnregistered,
  getOtherWorkerNames,
  resolveWorkerFolders,
} from "./src/infra/worker.ts";
import {
  renderBanner,
  renderProject,
  renderUser,
  renderModel,
  renderAgent,
  renderCached,
  renderThinking,
  renderInfo,
  renderError,
  renderSuccess,
  renderFetching,
  promptPrefix,
  promptQuestion,
} from "./src/render.ts";
import { handleChangeModel } from "./src/handlers/model.ts";
import { handleManageWorkers } from "./src/handlers/workers.ts";
import { handlePr } from "./src/handlers/pr.ts";
import { parsePrUrl, fetchPrInfo } from "./src/infra/github.ts";
import { parsePrShortcut } from "./src/llm/shortcuts.ts";
import { taskFlow, reviewFlow, reviewPrFlow } from "./src/flow/flows.ts";
import type { Capability } from "./src/flow/engine.ts";

// Bracketed paste: terminal wraps pasted text in \e[200~ ... \e[201~
// This transform sits between stdin and readline, intercepting paste markers
// and replacing newlines with spaces so readline sees a single line.
class PasteTransform extends Transform {
  // Proxy TTY methods to stdin so readline can control raw mode / echo
  get isTTY(): boolean {
    return process.stdin.isTTY ?? false;
  }

  setRawMode(mode: boolean): this {
    if (process.stdin.isTTY) process.stdin.setRawMode(mode);
    return this;
  }

  private pasting = false;
  private buf = "";

  _transform(chunk: Buffer, _encoding: string, callback: () => void): void {
    let s = chunk.toString();

    while (s.length > 0) {
      if (this.pasting) {
        const endIdx = s.indexOf("\x1b[201~");
        if (endIdx !== -1) {
          this.buf += s.slice(0, endIdx);
          this.push(this.buf.replace(/\r?\n/g, " "));
          this.buf = "";
          this.pasting = false;
          s = s.slice(endIdx + 6);
        } else {
          this.buf += s;
          s = "";
        }
      } else {
        const startIdx = s.indexOf("\x1b[200~");
        if (startIdx !== -1) {
          this.push(s.slice(0, startIdx));
          this.pasting = true;
          s = s.slice(startIdx + 6);
        } else {
          this.push(s);
          s = "";
        }
      }
    }

    callback();
  }
}

export function runCli(): void {
  renderBanner();

  const historyDir = join(homedir(), ".local", "share", "laoda");
  const historyPath = join(historyDir, "history");
  const loadHistory = (): string[] => {
    if (!existsSync(historyPath)) return [];
    try {
      return readFileSync(historyPath, "utf-8").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  const saveHistory = (history: readonly string[]): void => {
    if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });
    writeFileSync(historyPath, history.slice(0, 500).join("\n"), "utf-8");
  };

  // Enable bracketed paste mode, pipe stdin through transform
  process.stdout.write("\x1b[?2004h");
  const pasteStream = new PasteTransform();
  process.stdin.pipe(pasteStream);

  const rl = createInterface({
    input: pasteStream,
    output: process.stdout,
    history: loadHistory(),
    historySize: 500,
  });
  const cwd = process.cwd();
  const project = getProjectName(cwd);
  const logger = new Logger(project);
  const memo = new Memo(project);
  const registry = loadRegistry(project);

  rl.on("SIGINT", () => {
    process.stdout.write("\n");
  });

  rl.on("close", () => {
    process.stdout.write("\x1b[?2004l");
    console.log();
    process.exit(0);
  });

  function ask(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      process.stdin.resume();
      rl.question(prompt, (answer) => {
        process.stdin.pause();
        resolve(answer);
      });
    });
  }

  function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      process.stdin.resume();
      const saved = rl.history ?? [];
      rl.history = [];
      rl.question(prompt, (answer) => {
        rl.history = saved;
        process.stdin.pause();
        resolve(answer);
      });
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
    const ctx: Context = {
      cwd,
      userName,
      project,
      registry,
      agent: getAgent(),
      logAction: (action) => logger.logAction(action),
    };

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
      } catch (e: unknown) {
        renderInfo(`Failed to fetch models: ${e instanceof Error ? e.message : String(e)}`);
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
    renderAgent(ctx.agent);
    loop(ctx);
  }

  async function runFlow<In>(
    ctx: Context,
    cap: Capability<In, unknown>,
    input: In,
  ): Promise<Context> {
    const result = await cap.run(ctx, input, question);
    return result.ctx;
  }

  const llmLog = {
    request: (model: string, messages: unknown) => logger.logLlmRequest(model, messages),
    response: (raw: string) => logger.logLlmResponse(raw),
  };

  async function loop(ctx: Context): Promise<void> {
    console.log();
    const input = (await ask(promptPrefix())).trim();
    if (input) saveHistory(rl.history ?? []);
    if (!input) {
      loop(ctx);
      return;
    }

    logger.logUserInput(input);
    let nextCtx = ctx;
    try {
      // "pr" / "get pr" / "xxx pr" shortcut — list PRs via flow
      const prListIntent = parsePrShortcut(input);
      if (prListIntent) {
        nextCtx = await runFlow(ctx, reviewPrFlow, {
          target: prListIntent.target,
          userName: ctx.userName,
        });
        loop(nextCtx);
        return;
      }

      // PR URL shortcut — skip LLM
      const prParsed = parsePrUrl(input);
      if (prParsed) {
        renderFetching(`Fetching PR #${prParsed.number}...`);
        const pr = fetchPrInfo(prParsed.owner, prParsed.repo, prParsed.number);
        nextCtx = await handlePr(ctx, pr, question);
        loop(nextCtx);
        return;
      }

      const cached = memo.lookup(input);
      let intent;
      if (cached) {
        intent = cached;
        renderCached();
      } else {
        renderThinking();
        intent = await classifyIntent(input, getOtherWorkerNames(ctx.registry), llmLog);
        const cacheable: Intent["type"][] = ["task", "review", "manage_workers"];
        if (cacheable.includes(intent.type)) {
          memo.save(input, intent);
        }
      }
      logger.logIntent(intent);

      if (intent.type === "task") {
        nextCtx = await runFlow(ctx, taskFlow, {
          task: intent.task,
          branchName: intent.branchName,
          userName: ctx.userName,
        });
      } else if (intent.type === "review") {
        nextCtx = await runFlow(ctx, reviewFlow, {
          workerName: intent.workerName,
          workerRole: intent.workerRole,
          task: intent.task,
          branchName: intent.branchName,
          userName: ctx.userName,
        });
      } else if (intent.type === "manage_workers") {
        nextCtx = await handleManageWorkers(ctx, question);
      } else if (intent.type === "change_model") {
        nextCtx = await handleChangeModel(ctx, intent, question);
      } else if (intent.type === "list_pr") {
        nextCtx = await runFlow(ctx, reviewPrFlow, {
          target: intent.target,
          userName: ctx.userName,
        });
      } else if (intent.type === "change_agent") {
        setAgent(intent.agent);
        renderSuccess(`Agent set to ${intent.agent}`);
        nextCtx = { ...ctx, agent: intent.agent };
      } else {
        renderInfo(`${intent.message}\n  project: ${ctx.project}\n  cwd: ${ctx.cwd}`);
      }
    } catch (e: unknown) {
      const msg = `${e instanceof Error ? e.message : String(e)}\n  project: ${ctx.project}\n  cwd: ${ctx.cwd}`;
      logger.logError(msg);
      renderError(msg);
    }

    loop(nextCtx);
  }

  setup();
}
