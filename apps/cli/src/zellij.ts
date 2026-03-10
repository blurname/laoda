import { execFileSync } from "child_process";

export function spawnTab(title: string, prompt: string, cwd?: string): void {
  // Create a new tab
  const tabArgs = ["action", "new-tab", "-n", title, ...(cwd ? ["-c", cwd] : [])];
  execFileSync("zellij", tabArgs, { stdio: "ignore" });

  // Run claude in the new tab's pane (use shell so PATH is resolved)
  const runArgs = ["run", "-i", ...(cwd ? ["--cwd", cwd] : []), "--", "bash", "-ic", `claude ${JSON.stringify(prompt)}`];
  execFileSync("zellij", runArgs, { stdio: "ignore" });
}
