import { execSync, execFileSync } from "child_process";

function exec(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

export function createSession(name: string): void {
  execSync(`zellij --session ${name} options --detach-on-session-close false`, {
    stdio: "ignore",
    env: { ...process.env, ZELLIJ_AUTO_ATTACH: "false" },
  });
}

export function spawnPane(session: string, title: string, prompt: string, cwd?: string): void {
  const args = [
    "--session",
    session,
    "run",
    "-n",
    title,
    ...(cwd ? ["--cwd", cwd] : []),
    "--",
    "claude",
    prompt,
  ];
  execFileSync("zellij", args, { stdio: "ignore" });
}

export function listSessions(): string[] {
  try {
    const output = exec("zellij ls -s");
    return output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("laoda-"));
  } catch {
    return [];
  }
}

export function killSession(name: string): void {
  execSync(`zellij kill-session ${name}`, { stdio: "ignore" });
}
