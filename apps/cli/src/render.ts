import { emit } from "@laoda/ui-core/src/bridge/message-sink.ts";

// ─── ANSI colors (used by default console sink) ───

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function renderBanner(): void {
  emit("raw", "");
  emit("raw", `${c.bold}  LAODA${c.reset} ${c.dim}brain${c.reset}`);
  emit("raw", `${c.dim}  ${"─".repeat(50)}${c.reset}`);
  emit("raw", `  ${c.dim}Ctrl+D to exit${c.reset}`);
}

export function renderProject(project: string): void {
  emit("info", `${c.dim}Project: ${c.reset}${c.bold}${project}${c.reset}`);
}

export function renderUser(name: string): void {
  emit("info", `${c.dim}User: ${c.reset}${c.bold}${name}${c.reset}`);
}

export function renderModel(model: string): void {
  emit("info", `${c.dim}Model: ${c.reset}${c.bold}${model}${c.reset}`);
}

export function renderAgent(agent: string): void {
  emit("info", `${c.dim}Agent: ${c.reset}${c.bold}${agent}${c.reset}`);
}

export function renderThinking(): void {
  emit("progress", `${c.dim}Thinking...${c.reset}`);
}

export function renderReuse(path: string): void {
  emit("progress", `${c.yellow}↻${c.reset} Reusing ${c.bold}${path}${c.reset}`);
}

export function renderDuplicating(): void {
  emit("progress", `${c.cyan}⟳${c.reset} Duplicating...`);
}

export function renderDuplicated(dir: string): void {
  emit("success", `${c.green}✓${c.reset} ${dir}`);
}

export function renderPreparingBranch(branch: string): void {
  emit("progress", `${c.cyan}⟳${c.reset} Preparing branch ${c.bold}${branch}${c.reset}...`);
}

export function renderBranchReady(branch: string): void {
  emit("success", `${c.green}✓${c.reset} On branch ${branch}`);
}

export function renderTabCreated(): void {
  emit("success", `${c.green}✓${c.reset} Tab created`);
}

export function renderCancelled(): void {
  emit("cancelled", `${c.dim}Cancelled${c.reset}`);
}

export function renderInfo(message: string): void {
  emit("info", `${c.yellow}?${c.reset} ${message}`);
}

export function renderError(message: string): void {
  emit("error", `${c.red}✗${c.reset} ${message}`);
}

export function renderSuccess(message: string): void {
  emit("success", `${c.green}✓${c.reset} ${message}`);
}

export function renderFetching(message: string): void {
  emit("progress", `${c.cyan}⟳${c.reset} ${message}`);
}

export function renderModelOption(index: number, id: string, name: string): void {
  emit("raw", `  ${c.dim}${index}.${c.reset} ${id} ${c.dim}(${name})${c.reset}`);
}

export function promptPrefix(): string {
  return `  ${c.cyan}>${c.reset} `;
}

export function promptQuestion(message: string): string {
  return `  ${c.cyan}?${c.reset} ${message}`;
}

// ─── Flow error rendering ───

export function renderFlowError(error: {
  failedStep: string;
  cause: unknown;
  rollback: { attempted: boolean; results: { step: string; ok: boolean; error?: unknown }[] };
}): void {
  const cause = error.cause;
  const message =
    typeof cause === "object" && cause !== null && "message" in cause
      ? (cause as { message: string }).message
      : String(cause);

  emit("raw", "");
  emit(
    "flow_error",
    `${c.red}✗${c.reset} ${c.bold}${error.failedStep}${c.reset} failed: ${message}`,
  );

  if (typeof cause === "object" && cause !== null && "hint" in cause) {
    emit("raw", `  ${c.dim}  hint: ${(cause as { hint: string }).hint}${c.reset}`);
  }

  if (error.rollback.attempted) {
    const allOk = error.rollback.results.every((r) => r.ok);
    if (allOk) {
      emit("success", `${c.green}↺${c.reset} Rolled back successfully`);
    } else {
      for (const r of error.rollback.results) {
        if (r.ok) {
          emit("success", `${c.green}↺${c.reset} ${c.dim}${r.step}${c.reset} rolled back`);
        } else {
          emit(
            "error",
            `${c.red}↺${c.reset} ${c.dim}${r.step}${c.reset} rollback failed: ${r.error}`,
          );
        }
      }
    }
  }
  emit("raw", "");
}
