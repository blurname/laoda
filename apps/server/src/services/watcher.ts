import { watch } from "chokidar";
import { join } from "path";
import { getGitInfo } from "../utils/git";
import { notifyClients } from "./websocket";
import type { ServerMessage } from "@laoda/shared";

export const watchedPaths = new Set<string>();
export const watchers = new Map<string, any>();

export function startWatching(path: string, shouldBroadcast = true) {
  const id = Buffer.from(path).toString("base64");
  if (!watchedPaths.has(path)) {
    console.log(`[Watcher] Starting for: ${path}`);
    watchedPaths.add(path);

    const watcher = watch([path], {
      ignoreInitial: true,
      depth: 1,
      ignored: ["**/node_modules/**", "**/.git/**"],
    });

    // Also watch .git/HEAD and .git/index specifically for git changes
    const gitWatcher = watch(
      [join(path, ".git/HEAD"), join(path, ".git/index")],
      {
        ignoreInitial: true,
      },
    );

    const update = () => {
      const updatedGitInfo = getGitInfo(path);
      // Notify clients about Git info update for this specific path
      notifyClients({
        type: "GIT_INFO_UPDATE",
        path,
        ...updatedGitInfo,
      });
    };

    watcher.on("all", (event) => {
      console.log(`[Watcher] File event: ${event} in ${path}`);
      update();
    });
    gitWatcher.on("all", (event) => {
      console.log(`[Watcher] Git event: ${event} in ${path}`);
      update();
    });

    watchers.set(id, { watcher, gitWatcher });
  }
}
