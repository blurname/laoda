import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export function spawnTab(title: string, prompt: string, cwd?: string): void {
  // Create a temp layout that runs claude with the prompt
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const layout = `layout {
  tab name="${title}" cwd="${cwd || process.cwd()}" {
    pane command="bash" {
      args "-ic" "claude \\"${escapedPrompt}\\""
    }
  }
}`;

  const layoutPath = join(tmpdir(), `laoda-layout-${Date.now()}.kdl`);
  writeFileSync(layoutPath, layout, "utf-8");

  try {
    execFileSync("zellij", ["action", "new-tab", "-l", layoutPath], { stdio: "ignore" });
  } finally {
    try { unlinkSync(layoutPath); } catch {}
  }
}
