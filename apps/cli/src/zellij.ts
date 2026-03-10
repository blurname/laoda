import { execFileSync } from "child_process";

export function spawnPane(title: string, prompt: string, cwd?: string): void {
  const args = [
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
