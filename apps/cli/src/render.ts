/**
 * Terminal rendering utilities
 */
import type { CliProject } from "./store.ts";
import type { GitInfo } from "@laoda/shared";

// ANSI colors
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  bgGray: "\x1b[48;5;236m",
};

export function renderHeader(): void {
  console.log();
  console.log(`${c.bold}  LAODA${c.reset} ${c.dim}project manager${c.reset}`);
  console.log(`${c.dim}  ${"─".repeat(50)}${c.reset}`);
}

export function renderProject(
  project: CliProject,
  gitInfo: GitInfo | null,
  index: number,
): void {
  const idx = `${c.dim}${String(index + 1).padStart(3)}${c.reset}`;
  const name = `${c.bold}${project.name}${c.reset}`;

  if (!gitInfo) {
    console.log(`${idx}  ${name}  ${c.dim}${project.path}${c.reset}`);
    return;
  }

  const branch = `${c.cyan}${gitInfo.branch}${c.reset}`;
  const diff =
    gitInfo.diffCount > 0
      ? `${c.yellow}+${gitInfo.diffCount}${c.reset}`
      : `${c.dim}clean${c.reset}`;
  const commit = gitInfo.latestCommit
    ? `${c.dim}${gitInfo.latestCommit}${c.reset}`
    : "";

  console.log(`${idx}  ${name}`);
  console.log(`     ${branch}  ${diff}  ${commit}`);
  console.log(`     ${c.gray}${project.path}${c.reset}`);
}

export function renderEmpty(): void {
  console.log();
  console.log(`${c.dim}  No projects. Use ${c.reset}laoda add <path>${c.dim} to add one.${c.reset}`);
}

export function renderHelp(): void {
  console.log();
  console.log(`${c.bold}  LAODA${c.reset} ${c.dim}v2 - project manager${c.reset}`);
  console.log();
  console.log(`${c.bold}  Usage:${c.reset}`);
  console.log(`    laoda                      List projects with git status`);
  console.log(`    laoda add <path> [name]    Add a project`);
  console.log(`    laoda rm <path|index>      Remove a project`);
  console.log(`    laoda clear                Remove all projects`);
  console.log(`    laoda open <index> [ide]   Open project in IDE (default: cursor)`);
  console.log();
  console.log(`${c.bold}  Web mode:${c.reset}`);
  console.log(`    laoda --web [-p port]      Start web UI (default port: 26124)`);
  console.log();
  console.log(`${c.bold}  Options:${c.reset}`);
  console.log(`    -h, --help                 Show this help`);
  console.log();
}

export function renderDone(msg: string): void {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

export function renderError(msg: string): void {
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
}
