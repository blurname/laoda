import { readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

/**
 * Check if a folder has no git diff (clean working tree)
 */
function isGitClean(dir: string): boolean {
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

/**
 * Find a reusable sibling folder (same base name pattern, git clean).
 * Returns the path if found, null otherwise.
 */
export function findReusableFolder(cwd: string): string | null {
  const parentDir = join(cwd, "..");
  const fullName = basename(cwd);

  // Get base name (strip trailing -number)
  const match = fullName.match(/^(.*?)-(\d+)$/);
  const baseName = match ? match[1]! : fullName;

  let siblings: string[];
  try {
    siblings = readdirSync(parentDir);
  } catch {
    return null;
  }

  // Find sibling folders matching baseName-N pattern
  const candidates = siblings
    .filter((name) => {
      const m = name.match(/^(.*?)-(\d+)$/);
      return m && m[1] === baseName;
    })
    .map((name) => join(parentDir, name))
    .filter((p) => p !== cwd && existsSync(join(p, ".git")));

  for (const candidate of candidates) {
    if (isGitClean(candidate)) {
      return candidate;
    }
  }

  return null;
}
