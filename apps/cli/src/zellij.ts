import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export function spawnTab(title: string, prompt: string, cwd?: string): void {
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const layout = `layout {
  default_tab_template {
    pane size=1 borderless=true {
      plugin location="zellij:tab-bar"
    }
    children
  }
  tab name="${title}" cwd="${cwd || process.cwd()}" {
    pane command="bash" {
      args "-ic" "claude \\"${escapedPrompt}\\""
    }
  }
}`;

  const layoutPath = join(tmpdir(), `laoda-layout-${Date.now()}.kdl`);
  writeFileSync(layoutPath, layout, "utf-8");

  try {
    const args = ["action", "new-tab", "-l", layoutPath];
    execFileSync("zellij", args, { stdio: "pipe" });
  } finally {
    try { unlinkSync(layoutPath); } catch {}
  }
}
