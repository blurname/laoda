import { createInterface } from "readline";
import { execSync } from "child_process";
import { spawnTab } from "./src/zellij.ts";
import { findReusableFolder } from "./src/workspace.ts";
import { duplicateFolder } from "@laoda/capability";

function findEnvFiles(dir: string): string[] {
  try {
    // Find all .env* files that are gitignored (including in subdirectories)
    const output = execSync("git ls-files -z --others --ignored --exclude-standard", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output
      .split("\0")
      .filter((f) => f && /(?:^|\/)\.env/.test(f));
  } catch {
    return [];
  }
}

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
  console.log(`  ${c.dim}Ctrl+D to exit${c.reset}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const cwd = process.cwd();

  // Ctrl+C just clears current line, don't exit
  rl.on("SIGINT", () => {
    // write empty line and re-prompt
    process.stdout.write("\n");
  });

  // Ctrl+D (EOF) exits
  rl.on("close", () => {
    console.log();
    process.exit(0);
  });

  function prompt(): void {
    console.log();
    rl.question(`  ${c.cyan}?${c.reset} Enter task: `, (task) => {
      const trimmed = task.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      try {
        const reusable = findReusableFolder(cwd);
        let targetDir: string;
        if (reusable) {
          targetDir = reusable;
          console.log(`  ${c.yellow}↻${c.reset} Reusing ${c.bold}${reusable}${c.reset}`);
        } else {
          console.log(`  ${c.cyan}⟳${c.reset} Duplicating...`);
          const envFiles = findEnvFiles(cwd);
          targetDir = duplicateFolder(cwd, envFiles);
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
