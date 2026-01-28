import { execSync } from "child_process";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

export function getGitInfo(path: string) {
  try {
    const headPath = join(path, ".git", "HEAD");
    if (!existsSync(headPath))
      return { branch: "no branch", diffCount: 0, latestCommit: "" };

    // Get Branch
    let branch = "unknown";
    const head = readFileSync(headPath, "utf8");
    if (head.startsWith("ref: ")) {
      branch = head.replace("ref: refs/heads/", "").trim();
    } else {
      branch = head.trim().substring(0, 7);
    }

    // Get Diff Count (modified + untracked)
    let diffCount = 0;
    try {
      const status = execSync("git status --porcelain", {
        cwd: path,
      }).toString();
      diffCount = status
        .split("\n")
        .filter((line) => line.trim().length > 0).length;
    } catch {
      // ignore
    }

    // Get Latest Commit Info
    let latestCommit = "";
    try {
      latestCommit = execSync('git log -1 --format="%s (%h)"', { cwd: path })
        .toString()
        .trim();
    } catch {
      // ignore
    }

    return { branch, diffCount, latestCommit };
  } catch {
    return { branch: "unknown", diffCount: 0, latestCommit: "" };
  }
}
