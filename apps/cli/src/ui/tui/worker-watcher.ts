import { join } from "path";
import { watch } from "chokidar";
import type { WorkerRegistry } from "../../types.ts";
import type { WorkerDisplay } from "../core/types.ts";
import { resolveWorkerFolders } from "../../infra/worker.ts";
import { scanWorkerStatus } from "./worker-scan.ts";

type WatcherState = {
  watcher: ReturnType<typeof watch> | null;
  paths: Set<string>;
};

const state: WatcherState = { watcher: null, paths: new Set() };

function gitIndexPaths(cwd: string, registry: WorkerRegistry): string[] {
  return resolveWorkerFolders(cwd, registry)
    .filter((wf) => wf.exists)
    .map((wf) => join(wf.path, ".git", "index"));
}

export function startWatching(
  cwd: string,
  registry: WorkerRegistry,
  onChange: (workers: WorkerDisplay[]) => void,
): void {
  stopWatching();

  const paths = gitIndexPaths(cwd, registry);
  state.paths = new Set(paths);

  if (paths.length === 0) return;

  // Debounce: git operations write .git/index multiple times in quick succession
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debouncedScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        onChange(scanWorkerStatus(cwd, registry));
      } catch {}
    }, 500);
  };

  state.watcher = watch(paths, { ignoreInitial: true, disableGlobbing: true });
  state.watcher.on("change", debouncedScan);

  // Also watch .git/HEAD for branch switches
  const headPaths = resolveWorkerFolders(cwd, registry)
    .filter((wf) => wf.exists)
    .map((wf) => join(wf.path, ".git", "HEAD"));
  state.watcher.add(headPaths);
}

export function stopWatching(): void {
  if (state.watcher) {
    state.watcher.close();
    state.watcher = null;
  }
  state.paths.clear();
}
