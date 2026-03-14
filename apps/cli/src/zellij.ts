import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { AgentType } from "./types.ts";

function writeRunScript(agent: AgentType, prompt: string): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scriptPath = join(tmpdir(), `laoda-run-${id}.sh`);

  const cmd = agent === "cursor" ? "cursor agent" : "claude";
  // Embed prompt in a heredoc to avoid any shell escaping issues
  const lines = [
    "#!/bin/bash",
    `PROMPT=$(cat <<'LAODA_EOF'`,
    prompt,
    "LAODA_EOF",
    ")",
    `exec ${cmd} "$PROMPT"`,
  ];

  writeFileSync(scriptPath, lines.join("\n") + "\n", "utf-8");
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function buildPaneCommand(
  agent: AgentType,
  prompt: string,
): { kdl: string; scriptPath: string | null } {
  if (!prompt) {
    const kdl =
      agent === "cursor"
        ? `pane command="cursor" {\n      args "agent"\n    }`
        : `pane command="claude"`;
    return { kdl, scriptPath: null };
  }

  const scriptPath = writeRunScript(agent, prompt);
  const kdl = `pane command="${scriptPath}"`;
  return { kdl, scriptPath };
}

export function spawnTab(title: string, prompt: string, cwd: string, agent: AgentType): void {
  const { kdl: paneCommand } = buildPaneCommand(agent, prompt);

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
    // Script cleanup is intentionally skipped — zellij reads layout async,
    // and the script must exist when the pane starts. OS cleans up /tmp.
  }
}
