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
} from "./src/render.ts";
import { runBrain } from "./src/brain.ts";

export async function runCli(args: string[]): Promise<void> {
  const command = args[0];

  // No args → list projects (backward compat)
  if (!command) {
    listProjectsView();
    return;
  }

  // Known subcommands
  switch (command) {
    case "ls":
    case "list":
      listProjectsView();
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
    case "-h":
    case "--help":
    case "help":
      renderHelp();
      return;
  }

  // Default: treat all args as a task for brain
  const task = args.join(" ");
  try {
    runBrain(task, process.cwd());
  } catch (e: any) {
    renderError(e.message);
  }
}

function listProjectsView(): void {
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

