import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export function spawnTab(title: string, prompt: string, cwd?: string): void {
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const layout = `pane command="bash" {
  args "-ic" "claude \\"${escapedPrompt}\\""
}`;

  const layoutPath = join(tmpdir(), `laoda-layout-${Date.now()}.kdl`);
  writeFileSync(layoutPath, layout, "utf-8");

  try {
    const args = [
      "action", "new-tab",
      "-l", layoutPath,
      "-n", title,
      ...(cwd ? ["-c", cwd] : []),
    ];
    execFileSync("zellij", args, { stdio: "ignore" });
  } finally {
    try { unlinkSync(layoutPath); } catch {}
  }
}
