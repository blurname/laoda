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
  console.log();
  console.log(`${c.bold}  LAODA${c.reset} ${c.dim}brain${c.reset}`);
  console.log(`${c.dim}  ${"─".repeat(50)}${c.reset}`);
  console.log(`  ${c.dim}Ctrl+D to exit${c.reset}`);
}

export function renderProject(project: string): void {
  console.log(`  ${c.dim}Project: ${c.reset}${c.bold}${project}${c.reset}`);
}

export function renderUser(name: string): void {
  console.log(`  ${c.dim}User: ${c.reset}${c.bold}${name}${c.reset}`);
}

export function renderModel(model: string): void {
  console.log(`  ${c.dim}Model: ${c.reset}${c.bold}${model}${c.reset}`);
}

export function renderCached(): void {
  console.log(`  ${c.dim}(cached)${c.reset}`);
}

export function renderThinking(): void {
  console.log(`  ${c.dim}Thinking...${c.reset}`);
}

export function renderReuse(path: string): void {
  console.log(`  ${c.yellow}↻${c.reset} Reusing ${c.bold}${path}${c.reset}`);
}

export function renderDuplicating(): void {
  console.log(`  ${c.cyan}⟳${c.reset} Duplicating...`);
}

export function renderDuplicated(dir: string): void {
  console.log(`  ${c.green}✓${c.reset} ${dir}`);
}

export function renderPreparingBranch(branch: string): void {
  console.log(`  ${c.cyan}⟳${c.reset} Preparing branch ${c.bold}${branch}${c.reset}...`);
}

export function renderBranchReady(branch: string): void {
  console.log(`  ${c.green}✓${c.reset} On branch ${branch}`);
}

export function renderTabCreated(): void {
  console.log(`  ${c.green}✓${c.reset} Tab created`);
}

export function renderCancelled(): void {
  console.log(`  ${c.dim}Cancelled${c.reset}`);
}

export function renderInfo(message: string): void {
  console.log(`  ${c.yellow}?${c.reset} ${message}`);
}

export function renderError(message: string): void {
  console.log(`  ${c.red}✗${c.reset} ${message}`);
}

export function renderSuccess(message: string): void {
  console.log(`  ${c.green}✓${c.reset} ${message}`);
}

export function renderFetching(message: string): void {
  console.log(`  ${c.cyan}⟳${c.reset} ${message}`);
}

export function renderModelOption(index: number, id: string, name: string): void {
  console.log(`  ${c.dim}${index}.${c.reset} ${id} ${c.dim}(${name})${c.reset}`);
}

export function promptPrefix(): string {
  return `  ${c.cyan}>${c.reset} `;
}

export function promptQuestion(message: string): string {
  return `  ${c.cyan}?${c.reset} ${message}`;
}
