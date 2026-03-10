import { existsSync } from "fs";
import { resolve } from "path";
import { getGitInfo } from "../server/src/utils/git.ts";
import { osAdapter } from "../server/src/adapters/os.ts";
import { getProjects, addProject, removeProject, clearProjects } from "./src/store.ts";
import {
  renderHeader,
  renderProject,
  renderEmpty,
  renderHelp,
  renderDone,
  renderError,
  renderSessions,
  renderConfigValue,
} from "./src/render.ts";
import { setConfigValue, getConfigValue } from "./src/config.ts";
import { listSessions, killSession } from "./src/zellij.ts";
import { runBrain } from "./src/brain.ts";

export async function runCli(args: string[]): Promise<void> {
  const command = args[0];

  // No args → list projects (backward compat)
  if (!command) {
    listProjects();
    return;
  }

  // Known subcommands
  switch (command) {
    case "ls":
    case "list":
      listProjects();
      return;
    case "add":
      cmdAdd(args.slice(1));
      return;
    case "rm":
    case "remove":
      cmdRemove(args.slice(1));
      return;
    case "clear":
      clearProjects();
      renderDone("All projects removed.");
      return;
    case "open":
      await cmdOpen(args.slice(1));
      return;
    case "config":
      cmdConfig(args.slice(1));
      return;
    case "status":
      renderSessions(listSessions());
      return;
    case "kill":
      cmdKill(args.slice(1));
      return;
    case "-h":
    case "--help":
    case "help":
      renderHelp();
      return;
  }

  // Default: treat all args as a task for brain
  const task = args.join(" ");
  try {
    await runBrain(task, process.cwd());
  } catch (e: any) {
    renderError(e.message);
  }
}

function listProjects(): void {
  const projects = getProjects();

  renderHeader();

  if (projects.length === 0) {
    renderEmpty();
    console.log();
    return;
  }

  console.log();
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i]!;
    const gitInfo = existsSync(p.path) ? getGitInfo(p.path) : null;
    renderProject(p, gitInfo, i);
    if (i < projects.length - 1) console.log();
  }
  console.log();
}

function cmdAdd(args: string[]): void {
  const rawPath = args[0];
  if (!rawPath) {
    renderError("Usage: laoda add <path> [name]");
    return;
  }

  const fullPath = resolve(rawPath);
  if (!existsSync(fullPath)) {
    renderError(`Path does not exist: ${fullPath}`);
    return;
  }

  const name = args[1];
  const project = addProject(fullPath, name);
  renderDone(`Added: ${project.name} (${project.path})`);
}

function cmdRemove(args: string[]): void {
  const target = args[0];
  if (!target) {
    renderError("Usage: laoda rm <path|index>");
    return;
  }

  const idx = parseInt(target);
  if (!isNaN(idx)) {
    const projects = getProjects();
    const p = projects[idx - 1];
    if (!p) {
      renderError(`No project at index ${idx}`);
      return;
    }
    removeProject(p.path);
    renderDone(`Removed: ${p.name}`);
    return;
  }

  const fullPath = resolve(target);
  if (removeProject(fullPath)) {
    renderDone(`Removed: ${fullPath}`);
  } else {
    renderError(`Not found: ${fullPath}`);
  }
}

async function cmdOpen(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) {
    renderError("Usage: laoda open <index> [ide]");
    return;
  }

  const idx = parseInt(target);
  const projects = getProjects();
  const p = isNaN(idx) ? projects.find((pr) => pr.path === resolve(target)) : projects[idx - 1];

  if (!p) {
    renderError(`Project not found: ${target}`);
    return;
  }

  const ide = args[1] || "Cursor";
  try {
    await osAdapter.openInIDE(ide, p.path);
    renderDone(`Opened ${p.name} in ${ide}`);
  } catch (e: any) {
    renderError(`Failed to open: ${e.message}`);
  }
}

function cmdConfig(args: string[]): void {
  const action = args[0];

  if (!action || action === "get") {
    const key = args[1];
    if (!key) {
      // Show all LLM config
      for (const k of ["llm.provider", "llm.apiKey", "llm.model", "llm.baseUrl"]) {
        renderConfigValue(k, getConfigValue(k));
      }
      return;
    }
    renderConfigValue(key, getConfigValue(key));
    return;
  }

  if (action === "set") {
    const key = args[1];
    const value = args[2];
    if (!key || !value) {
      renderError("Usage: laoda config set <key> <value>");
      return;
    }
    setConfigValue(key, value);
    renderDone(`${key} = ${value}`);
    return;
  }

  renderError("Usage: laoda config [get <key> | set <key> <value>]");
}

function cmdKill(args: string[]): void {
  const name = args[0];
  if (!name) {
    renderError("Usage: laoda kill <session>");
    return;
  }
  try {
    killSession(name);
    renderDone(`Killed session: ${name}`);
  } catch (e: any) {
    renderError(`Failed to kill session: ${e.message}`);
  }
}
