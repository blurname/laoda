import { createInterface } from "readline";
import { spawnTab } from "./src/zellij.ts";
import { findReusableFolder } from "./src/workspace.ts";
import { duplicateFolder } from "@laoda/capability";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function runCli(): void {
  console.log();
  console.log(`${c.bold}  LAODA${c.reset} ${c.dim}brain${c.reset}`);
  console.log(`${c.dim}  ${"─".repeat(50)}${c.reset}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const cwd = process.cwd();

  function prompt(): void {
    console.log();
    rl.question(`  ${c.cyan}?${c.reset} Enter task: `, (task) => {
      const trimmed = task.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      try {
        // Find reusable or duplicate
        const reusable = findReusableFolder(cwd);
        let targetDir: string;
        if (reusable) {
          targetDir = reusable;
          console.log(`  ${c.yellow}↻${c.reset} Reusing ${c.bold}${reusable}${c.reset}`);
        } else {
          console.log(`  ${c.cyan}⟳${c.reset} Duplicating...`);
          targetDir = duplicateFolder(cwd);
          console.log(`  ${c.green}✓${c.reset} ${targetDir}`);
        }

        spawnTab(trimmed.slice(0, 40), trimmed, targetDir);
        console.log(`  ${c.green}✓${c.reset} Tab created`);
      } catch (e: any) {
        console.log(`  ${c.red}✗${c.reset} ${e.message}`);
      }

      prompt();
    });
  }

  prompt();
}
