import { createInterface } from "readline";
import { execSync } from "child_process";
import { spawnTab } from "./src/zellij.ts";
import { findReusableFolder } from "./src/workspace.ts";
import { duplicateFolder } from "@laoda/capability";
import { getName, setName, getOpenRouterKey, setOpenRouterKey } from "./src/config.ts";
import { generateBranchName } from "./src/llm.ts";

function findEnvFiles(dir: string): string[] {
  try {
    const output = execSync("git ls-files -z --others --ignored --exclude-standard", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output
      .split("\0")
      .filter((f) => f && /(?:^|\/)\.env\.local$/.test(f));
  } catch {
    return [];
  }
}

function getMainBranch(dir: string): string {
  try {
    const output = execSync("git remote show origin | grep 'HEAD branch'", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().replace("HEAD branch:", "").trim();
  } catch {
    return "main";
  }
}

function prepareGitBranch(dir: string, branchName: string): void {
  const main = getMainBranch(dir);
  execSync(`git fetch origin ${main}`, { cwd: dir, stdio: "pipe" });
  execSync(`git checkout ${main}`, { cwd: dir, stdio: "pipe" });
  execSync(`git reset --hard origin/${main}`, { cwd: dir, stdio: "pipe" });
  execSync(`git checkout -b ${branchName}`, { cwd: dir, stdio: "pipe" });
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
  let userName = "";

  rl.on("SIGINT", () => {
    process.stdout.write("\n");
  });

  rl.on("close", () => {
    console.log();
    process.exit(0);
  });

  function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  async function setup(): Promise<void> {
    // Name
    const savedName = getName();
    if (savedName) {
      userName = savedName;
      console.log(`  ${c.dim}User: ${c.reset}${c.bold}${savedName}${c.reset}`);
    } else {
      console.log();
      while (!userName) {
        const name = (await question(`  ${c.cyan}?${c.reset} Your name (for branch prefix): `)).trim();
        if (name) {
          userName = name;
          setName(name);
        }
      }
    }

    // OpenRouter key
    if (!getOpenRouterKey()) {
      console.log();
      let key = "";
      while (!key) {
        key = (await question(`  ${c.cyan}?${c.reset} OpenRouter API key: `)).trim();
      }
      setOpenRouterKey(key);
      console.log(`  ${c.green}✓${c.reset} Key saved`);
    }

    promptTask();
  }

  async function promptTask(): Promise<void> {
    console.log();
    const task = (await question(`  ${c.cyan}?${c.reset} Enter task: `)).trim();
    if (!task) {
      promptTask();
      return;
    }

    try {
      // Generate branch name via LLM
      console.log(`  ${c.cyan}⟳${c.reset} Generating branch name...`);
      const slug = await generateBranchName(task);
      const branch = `${userName}/${slug}`;

      // Find or create workspace
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

      // Prepare git branch
      console.log(`  ${c.cyan}⟳${c.reset} Preparing branch ${c.bold}${branch}${c.reset}...`);
      prepareGitBranch(targetDir, branch);
      console.log(`  ${c.green}✓${c.reset} On branch ${branch}`);

      // Spawn tab with slug as tab name
      spawnTab(slug, task, targetDir);
      console.log(`  ${c.green}✓${c.reset} Tab created`);
    } catch (e: any) {
      console.log(`  ${c.red}✗${c.reset} ${e.message}`);
    }

    promptTask();
  }

  setup();
}
