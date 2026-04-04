import type { WorkerRegistry } from "../../types.ts";
import type { WorkerDisplay } from "../core/types.ts";
import { resolveWorkerFolders, workerFolderName } from "../../infra/worker.ts";
import { isGitClean } from "../../infra/workspace.ts";

export function scanWorkerStatus(cwd: string, registry: WorkerRegistry): WorkerDisplay[] {
  const folders = resolveWorkerFolders(cwd, registry);

  return folders.map((wf) => {
    const label = wf.worker.type === "my" ? String(wf.worker.index) : wf.worker.name;

    if (!wf.exists) {
      return {
        label,
        workerType: wf.worker.type,
        status: "missing" as const,
        folder: workerFolderName(registry.project, wf.worker),
      };
    }

    const gitClean = isGitClean(wf.path);
    const status = wf.worker.type === "my" ? wf.worker.status : ("idle" as const);

    return {
      label,
      workerType: wf.worker.type,
      status,
      task: wf.worker.type === "my" ? wf.worker.task : undefined,
      branch: wf.worker.type === "my" ? wf.worker.branch : undefined,
      folder: workerFolderName(registry.project, wf.worker),
      gitClean,
    };
  });
}
