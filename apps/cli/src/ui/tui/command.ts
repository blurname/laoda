import type { Context, QuestionFn } from "../../types.ts";
import type { LlmLog } from "../../llm/classify.ts";
import type { Action } from "../core/types.ts";
import { classifyIntent } from "../../llm/classify.ts";
import { parsePrShortcut } from "../../llm/shortcuts.ts";
import { parsePrUrl, fetchPrInfo } from "../../infra/github.ts";
import { getOtherWorkerNames } from "../../infra/worker.ts";
import { setAgent } from "../../infra/config.ts";
import { taskFlow, reviewFlow, reviewPrFlow } from "../../flow/flows.ts";
import { handlePr } from "../../handlers/pr.ts";
import { handleManageWorkers } from "../../handlers/workers.ts";
import { handleChangeModel } from "../../handlers/model.ts";
import {
  renderThinking,
  renderFetching,
  renderSuccess,
  renderInfo,
  renderError,
  renderCancelled,
  renderFlowError,
} from "../../render.ts";
import type { Flow } from "../../flow/engine.ts";

async function runFlow<In>(
  ctx: Context,
  f: Flow<In, unknown>,
  input: In,
  questionFn: QuestionFn,
): Promise<Context> {
  const result = await f.run(ctx, input, questionFn);
  if (!result.ok) {
    renderFlowError(result.error);
    return result.ctx;
  }
  return result.ctx;
}

export async function handleCommand(
  input: string,
  ctx: Context,
  dispatch: (action: Action) => void,
  questionFn: QuestionFn,
  llmLog: LlmLog,
  signal: AbortSignal,
): Promise<Context> {
  let nextCtx = ctx;

  try {
    // PR list shortcut
    const prListIntent = parsePrShortcut(input);
    if (prListIntent) {
      dispatch({ type: "SET_MODE", mode: "running" });
      nextCtx = await runFlow(
        ctx,
        reviewPrFlow,
        { target: prListIntent.target, userName: ctx.userName },
        questionFn,
      );
      return nextCtx;
    }

    // PR URL shortcut
    const prParsed = parsePrUrl(input);
    if (prParsed) {
      dispatch({ type: "SET_MODE", mode: "running" });
      renderFetching(`Fetching PR #${prParsed.number}...`);
      const pr = fetchPrInfo(prParsed.owner, prParsed.repo, prParsed.number);
      nextCtx = await handlePr(ctx, pr, questionFn);
      return nextCtx;
    }

    // LLM classify
    dispatch({ type: "SET_MODE", mode: "thinking" });
    renderThinking();
    const intent = await classifyIntent(input, getOtherWorkerNames(ctx.registry), llmLog, signal);

    dispatch({ type: "SET_MODE", mode: "running" });

    if (intent.type === "task") {
      nextCtx = await runFlow(
        ctx,
        taskFlow,
        { task: intent.task, branchName: intent.branchName, userName: ctx.userName },
        questionFn,
      );
    } else if (intent.type === "review") {
      nextCtx = await runFlow(
        ctx,
        reviewFlow,
        {
          workerName: intent.workerName,
          workerRole: intent.workerRole,
          task: intent.task,
          branchName: intent.branchName,
          userName: ctx.userName,
        },
        questionFn,
      );
    } else if (intent.type === "manage_workers") {
      nextCtx = await handleManageWorkers(ctx, questionFn);
    } else if (intent.type === "change_model") {
      nextCtx = await handleChangeModel(ctx, intent, questionFn);
    } else if (intent.type === "list_pr") {
      nextCtx = await runFlow(
        ctx,
        reviewPrFlow,
        { target: intent.target, userName: ctx.userName },
        questionFn,
      );
    } else if (intent.type === "change_agent") {
      setAgent(intent.agent);
      renderSuccess(`Agent set to ${intent.agent}`);
      nextCtx = { ...ctx, agent: intent.agent };
    } else {
      renderInfo(`${intent.message}\n  project: ${ctx.project}\n  cwd: ${ctx.cwd}`);
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      renderCancelled();
    } else {
      renderError(
        `${e instanceof Error ? e.message : String(e)}\n  project: ${ctx.project}\n  cwd: ${ctx.cwd}`,
      );
    }
  }

  return nextCtx;
}
