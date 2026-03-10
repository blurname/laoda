import { createInterface } from "readline";
import { spawnTab } from "./src/zellij.ts";
import { duplicateFolder } from "../capability/copy.ts";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

export function runCli(): void {
  console.log();
  console.log(`${c.bold}  LAODA${c.reset} ${c.dim}brain${c.reset}`);
  console.log(`${c.dim}  ${"─".repeat(50)}${c.reset}`);
  console.log();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  rl.question(`  ${c.cyan}?${c.reset} Enter task: `, (task) => {
    rl.close();
    const trimmed = task.trim();
    if (!trimmed) {
      console.log(`  ${c.red}✗${c.reset} No task provided`);
      return;
    }
    try {
      const cwd = process.cwd();
      console.log(`  ${c.cyan}⟳${c.reset} Duplicating ${cwd}...`);
      const newPath = duplicateFolder(cwd);
      console.log(`  ${c.green}✓${c.reset} ${newPath}`);
      spawnTab(trimmed.slice(0, 40), trimmed, newPath);
      console.log(`  ${c.green}✓${c.reset} Tab created`);
    } catch (e: any) {
      console.log(`  ${c.red}✗${c.reset} ${e.message}`);
    }
  });
}
