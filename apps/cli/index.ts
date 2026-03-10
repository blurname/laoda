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

export function runCli(args: string[]): void {
  const command = args[0];

  if (!command || command === "ls" || command === "list") {
    listProjects();
    return;
  }

  if (command === "add") {
    cmdAdd(args.slice(1));
    return;
  }

  if (command === "rm" || command === "remove") {
    cmdRemove(args.slice(1));
    return;
  }

  if (command === "clear") {
    clearProjects();
    renderDone("All projects removed.");
    return;
  }

  if (command === "open") {
    cmdOpen(args.slice(1));
    return;
  }

  // Unknown command, show help
  renderHelp();
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

  // Try as index first (1-based)
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

  // Try as path
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
