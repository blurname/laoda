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
  console.log(`${c.bold}  LAODA${c.reset} ${c.dim}v2 - brain + project manager${c.reset}`);
  console.log();
  console.log(`${c.bold}  Brain (default):${c.reset}`);
  console.log(`    laoda "task description"   Decompose task → Claude Code panes in Zellij`);
  console.log(`    laoda status               List active Zellij sessions`);
  console.log(`    laoda kill <session>        Kill a Zellij session`);
  console.log();
  console.log(`${c.bold}  Config:${c.reset}`);
  console.log(`    laoda config               Show LLM configuration`);
  console.log(`    laoda config set <k> <v>   Set config (e.g. llm.provider, llm.apiKey, llm.model)`);
  console.log(`    laoda config get <k>       Get config value`);
  console.log();
  console.log(`${c.bold}  Projects:${c.reset}`);
  console.log(`    laoda ls                   List projects with git status`);
  console.log(`    laoda add <path> [name]    Add a project`);
  console.log(`    laoda rm <path|index>      Remove a project`);
  console.log(`    laoda clear                Remove all projects`);
  console.log(`    laoda open <index> [ide]   Open project in IDE (default: cursor)`);
  console.log();
  console.log(`${c.bold}  Web mode:${c.reset}`);
  console.log(`    laoda --web [-p port]      Start web UI (default port: 26124)`);
  console.log();
}

export function renderDone(msg: string): void {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

export function renderError(msg: string): void {
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
}

// Brain-related rendering

import type { TaskPlan } from "./types.ts";

export function renderDecomposing(task: string): void {
  console.log();
  console.log(`${c.bold}  LAODA${c.reset} ${c.dim}brain${c.reset}`);
  console.log(`${c.dim}  ${"─".repeat(50)}${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}⟳${c.reset} Decomposing: ${c.bold}${task}${c.reset}`);
  console.log();
}

export function renderPlan(plan: TaskPlan): void {
  console.log(`  ${c.green}✓${c.reset} ${plan.subtasks.length} subtasks generated:`);
  console.log();
  for (const st of plan.subtasks) {
    console.log(`    ${c.bold}${st.id}.${c.reset} ${st.title}`);
    console.log(`       ${c.dim}${st.prompt.slice(0, 80)}${st.prompt.length > 80 ? "..." : ""}${c.reset}`);
  }
  console.log();
}

export function renderSessionInfo(sessionName: string, paneCount: number): void {
  console.log(`  ${c.green}✓${c.reset} Zellij session ${c.bold}${sessionName}${c.reset} created with ${paneCount} panes`);
  console.log();
  console.log(`  ${c.cyan}→${c.reset} Attach: ${c.bold}zellij attach ${sessionName}${c.reset}`);
  console.log();
}

export function renderSessions(sessions: string[]): void {
  if (sessions.length === 0) {
    console.log(`  ${c.dim}No active laoda sessions.${c.reset}`);
    return;
  }
  console.log();
  console.log(`${c.bold}  Active sessions:${c.reset}`);
  console.log();
  for (const s of sessions) {
    console.log(`    ${c.cyan}●${c.reset} ${s}`);
  }
  console.log();
}

export function renderConfigValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    console.log(`  ${c.dim}${key}${c.reset} = ${c.red}(not set)${c.reset}`);
  } else {
    const display = key.includes("apiKey") ? value.slice(0, 8) + "..." : value;
    console.log(`  ${c.dim}${key}${c.reset} = ${c.bold}${display}${c.reset}`);
  }
}
