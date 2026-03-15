import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Worker, WorkerRegistry, WorkerFolder, MyWorker, OtherWorker } from "../types.ts";
import { isGitClean } from "./workspace.ts";

const WORKERS_DIR = join(homedir(), ".local", "share", "laoda", "workers");

// ─── Registry persistence ───

function registryPath(project: string): string {
  return join(WORKERS_DIR, `${project}.json`);
}

export function loadRegistry(project: string): WorkerRegistry {
  const path = registryPath(project);
  if (!existsSync(path)) {
    return { project, workers: [], updatedAt: 0 };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as WorkerRegistry;
  } catch {
    return { project, workers: [], updatedAt: 0 };
  }
}

export function saveRegistry(registry: WorkerRegistry): void {
  if (!existsSync(WORKERS_DIR)) {
    mkdirSync(WORKERS_DIR, { recursive: true });
  }
  const updated = { ...registry, updatedAt: Date.now() };
  writeFileSync(registryPath(updated.project), JSON.stringify(updated, null, 2), "utf-8");
}

// ─── Folder naming ───

export function workerFolderName(project: string, worker: Worker): string {
  if (worker.type === "my") {
    return `${project}-${worker.index}`;
  }
  return `${project}-${worker.name}`;
}

export function workerDir(cwd: string, project: string, worker: Worker): string {
  return join(cwd, "..", workerFolderName(project, worker));
}

// ─── Physical folder scanning ───

export function scanSiblingFolders(cwd: string, project: string): string[] {
  const parentDir = join(cwd, "..");
  let siblings: string[];
  try {
    siblings = readdirSync(parentDir);
  } catch {
    return [];
  }

  return siblings.filter((name) => {
    if (name === project) return false;
    if (!name.startsWith(project + "-")) return false;
    return existsSync(join(parentDir, name, ".git"));
  });
}

export function classifyFolderSuffix(
  project: string,
  folderName: string,
): { type: "numeric"; index: number } | { type: "named"; name: string } | null {
  const prefix = project + "-";
  if (!folderName.startsWith(prefix)) return null;
  const suffix = folderName.slice(prefix.length);
  if (/^\d+$/.test(suffix)) {
    return { type: "numeric", index: parseInt(suffix) };
  }
  if (/^[a-z][a-z0-9-]*$/.test(suffix)) {
    return { type: "named", name: suffix };
  }
  return null;
}

// ─── Registry reconciliation ───

export function findUnregistered(registry: WorkerRegistry, physicalFolders: string[]): string[] {
  const registeredNames = new Set(
    registry.workers.map((w) => (w.type === "my" ? String(w.index) : w.name)),
  );

  return physicalFolders
    .map((f) => classifyFolderSuffix(registry.project, f))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter((c) => {
      const key = c.type === "numeric" ? String(c.index) : c.name;
      return !registeredNames.has(key);
    })
    .map((c) => (c.type === "numeric" ? String(c.index) : c.name));
}

// ─── Lookup ───

export function findOtherWorker(registry: WorkerRegistry, name: string): OtherWorker | null {
  const worker = registry.workers.find(
    (w): w is OtherWorker => w.type === "other" && w.name === name,
  );
  return worker ?? null;
}

export function findNextMyWorkerIndex(registry: WorkerRegistry): number {
  const myWorkers = registry.workers.filter((w): w is MyWorker => w.type === "my");
  if (myWorkers.length === 0) return 1;
  return Math.max(...myWorkers.map((w) => w.index)) + 1;
}

export function resolveWorkerFolders(cwd: string, registry: WorkerRegistry): WorkerFolder[] {
  return registry.workers.map((worker) => {
    const path = workerDir(cwd, registry.project, worker);
    return { worker, path, exists: existsSync(path) };
  });
}

// ─── Reconciliation ───

export function reconcileRegistry(
  registry: WorkerRegistry,
  cwd: string,
  newWorkers: { name: string; userType: "designer" | "product" }[],
): WorkerRegistry {
  const physicalFolders = scanSiblingFolders(cwd, registry.project);

  // Add numeric folders as MyWorkers
  const numericToAdd: Worker[] = physicalFolders
    .map((folder) => classifyFolderSuffix(registry.project, folder))
    .filter((c): c is { type: "numeric"; index: number } => c !== null && c.type === "numeric")
    .filter(
      (c) => !registry.workers.some((w): w is MyWorker => w.type === "my" && w.index === c.index),
    )
    .map((c): MyWorker => ({ type: "my", index: c.index, status: "idle" }));

  // Add named folders as OtherWorkers (using LLM classification)
  const namedToAdd: Worker[] = newWorkers
    .filter(
      (nw) =>
        !registry.workers.some((w): w is OtherWorker => w.type === "other" && w.name === nw.name),
    )
    .map((nw): OtherWorker => ({ type: "other", name: nw.name, userType: nw.userType }));

  const allWorkers = [...registry.workers, ...numericToAdd, ...namedToAdd];

  // Remove workers whose folders no longer exist
  const folderSet = new Set(physicalFolders);
  const filteredWorkers = allWorkers.filter((w) => {
    const name = workerFolderName(registry.project, w);
    return folderSet.has(name);
  });

  return { ...registry, workers: filteredWorkers };
}

export function getOtherWorkerNames(registry: WorkerRegistry): string[] {
  return registry.workers.filter((w): w is OtherWorker => w.type === "other").map((w) => w.name);
}

// ─── MyWorker allocation ───

export type AllocResult =
  | { action: "reuse"; worker: MyWorker; path: string }
  | { action: "create"; index: number };

export function allocateMyWorker(cwd: string, registry: WorkerRegistry): AllocResult {
  const myWorkers = registry.workers.filter((w): w is MyWorker => w.type === "my");

  // 1. Check logically idle workers, verify with git clean
  for (const w of myWorkers) {
    if (w.status === "idle") {
      const path = workerDir(cwd, registry.project, w);
      if (existsSync(path) && isGitClean(path)) {
        return { action: "reuse", worker: w, path };
      }
    }
  }

  // 2. All logically busy — physical scan to find any that are actually done
  for (const w of myWorkers) {
    if (w.status === "busy") {
      const path = workerDir(cwd, registry.project, w);
      if (existsSync(path) && isGitClean(path)) {
        return { action: "reuse", worker: { ...w, status: "idle" }, path };
      }
    }
  }

  // 3. All truly busy — need a new slot
  return { action: "create", index: findNextMyWorkerIndex(registry) };
}

export function makeWorkerBusy(worker: MyWorker, task: string, branch: string): MyWorker {
  return { ...worker, status: "busy", task, branch };
}

export function makeWorkerIdle(worker: MyWorker): MyWorker {
  return { ...worker, status: "idle", task: undefined, branch: undefined };
}

// ─── Immutable registry updates ───

export function replaceWorker(
  registry: WorkerRegistry,
  oldWorker: Worker,
  newWorker: Worker,
): WorkerRegistry {
  return {
    ...registry,
    workers: registry.workers.map((w) => (w === oldWorker ? newWorker : w)),
  };
}

export function addWorker(registry: WorkerRegistry, worker: Worker): WorkerRegistry {
  return { ...registry, workers: [...registry.workers, worker] };
}

export function removeWorkerByName(registry: WorkerRegistry, name: string): WorkerRegistry {
  return {
    ...registry,
    workers: registry.workers.filter((w) => !(w.type === "other" && w.name === name)),
  };
}
