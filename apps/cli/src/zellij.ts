import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { AgentType } from "./types.ts";

function buildPaneCommand(agent: AgentType, prompt: string): string {
  if (!prompt) {
    return agent === "cursor"
      ? `pane command="cursor" {\n      args "agent"\n    }`
      : `pane command="claude"`;
  }

  const escaped = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const cmd = agent === "cursor" ? `cursor agent "${escaped}"` : `claude "${escaped}"`;
  return `pane command="bash" {\n      args "-ic" "${cmd}"\n    }`;
}

export function spawnTab(title: string, prompt: string, cwd: string, agent: AgentType): void {
  const paneCommand = buildPaneCommand(agent, prompt);

  const layout = `layout {
  default_tab_template {
    pane size=1 borderless=true {
      plugin location="zellij:tab-bar"
    }
    children
  }
  tab name="${title}" cwd="${cwd}" {
    ${paneCommand}
  }
}`;

  const layoutPath = join(tmpdir(), `laoda-layout-${Date.now()}.kdl`);
  writeFileSync(layoutPath, layout, "utf-8");

  try {
    const args = ["action", "new-tab", "-l", layoutPath];
    execFileSync("zellij", args, { stdio: "pipe" });
  } finally {
    try {
      unlinkSync(layoutPath);
    } catch {}
  }
}
