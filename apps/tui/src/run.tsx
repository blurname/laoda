import React from "react";
import { render } from "ink";
import { App } from "./app.tsx";
import type { Context } from "@laoda/cli/src/types.ts";
import { getProjectName } from "@laoda/cli/src/infra/workspace.ts";
import {
  getName,
  setName,
  getOpenRouterKey,
  setOpenRouterKey,
  getAgent,
  isModelsCacheStale,
  saveModelsCache,
} from "@laoda/cli/src/infra/config.ts";
import { loadRegistry } from "@laoda/cli/src/infra/worker.ts";
import { fetchModels } from "@laoda/cli/src/llm/classify.ts";
import { Logger } from "@laoda/cli/src/infra/logger.ts";
import { createInterface } from "readline";

async function askLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setup(): Promise<Context> {
  const cwd = process.cwd();
  const project = getProjectName(cwd);

  let userName = getName();
  if (!userName) {
    userName = await askLine("Your name (for branch prefix): ");
    while (!userName) {
      userName = await askLine("Your name (for branch prefix): ");
    }
    setName(userName);
  }

  if (!getOpenRouterKey()) {
    let key = await askLine("OpenRouter API key: ");
    while (!key) {
      key = await askLine("OpenRouter API key: ");
    }
    setOpenRouterKey(key);
  }

  if (isModelsCacheStale()) {
    try {
      const models = await fetchModels();
      saveModelsCache(models.map((m) => ({ id: m.id, name: m.name })));
    } catch {}
  }

  const registry = loadRegistry(project);
  const logger = new Logger(project);

  return {
    cwd,
    userName,
    project,
    registry,
    agent: getAgent(),
    logAction: (action: string) => logger.logAction(action),
  };
}

export async function runTui(): Promise<void> {
  const ctx = await setup();
  const { waitUntilExit } = render(<App initialCtx={ctx} />);
  await waitUntilExit();
}
