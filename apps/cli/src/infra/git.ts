import { execSync } from "child_process";

export function findEnvFiles(dir: string): string[] {
  try {
    const output = execSync("git ls-files -z --others --ignored --exclude-standard", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.split("\0").filter((f) => f && /(?:^|\/)\\.env\\.local$/.test(f));
  } catch {
    return [];
  }
}

export function getMainBranch(dir: string): string {
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

export function branchExists(dir: string, branchName: string): boolean {
  try {
    execSync(`git rev-parse --verify ${branchName}`, { cwd: dir, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function prepareGitBranch(dir: string, branchName: string): void {
  const main = getMainBranch(dir);
  execSync(`git fetch origin ${main}`, { cwd: dir, stdio: "pipe" });
  execSync(`git checkout ${main}`, { cwd: dir, stdio: "pipe" });
  execSync(`git reset --hard origin/${main}`, { cwd: dir, stdio: "pipe" });

  if (branchExists(dir, branchName)) {
    execSync(`git branch -D ${branchName}`, { cwd: dir, stdio: "pipe" });
  }
  execSync(`git checkout -b ${branchName}`, { cwd: dir, stdio: "pipe" });
}
