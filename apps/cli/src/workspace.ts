import { basename } from "path";
import { execSync } from "child_process";

export function getProjectName(cwd: string): string {
  const fullName = basename(cwd);
  const match = fullName.match(/^(.*?)-(\d+)$/);
  return match ? match[1]! : fullName;
}

export function isGitClean(dir: string): boolean {
  try {
    const output = execSync("git diff --stat && git diff --cached --stat", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().length === 0;
  } catch {
    return false;
  }
}
