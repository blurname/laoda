import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Worker, WorkerRegistry, WorkerFolder, MyWorker, OtherWorker } from "./types.ts";

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
  registry.updatedAt = Date.now();
  writeFileSync(registryPath(registry.project), JSON.stringify(registry, null, 2), "utf-8");
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
  for (const folder of physicalFolders) {
    const classified = classifyFolderSuffix(registry.project, folder);
    if (!classified) continue;
    if (classified.type === "numeric") {
      const exists = registry.workers.some(
        (w): w is MyWorker => w.type === "my" && w.index === classified.index,
      );
      if (!exists) {
        registry.workers.push({ type: "my", index: classified.index });
      }
    }
  }

  // Add named folders as OtherWorkers (using LLM classification)
  for (const nw of newWorkers) {
    const exists = registry.workers.some(
      (w): w is OtherWorker => w.type === "other" && w.name === nw.name,
    );
    if (!exists) {
      registry.workers.push({ type: "other", name: nw.name, userType: nw.userType });
    }
  }

  // Remove workers whose folders no longer exist
  const folderSet = new Set(physicalFolders);
  registry.workers = registry.workers.filter((w) => {
    const name = workerFolderName(registry.project, w);
    return folderSet.has(name);
  });

  return registry;
}

export function getOtherWorkerNames(registry: WorkerRegistry): string[] {
  return registry.workers.filter((w): w is OtherWorker => w.type === "other").map((w) => w.name);
}
