/**
 * CLI persistent storage - stores project paths in ~/.laoda.json
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface CliProject {
  id: string;
  name: string;
  path: string;
  group?: string;
}

export interface CliStore {
  projects: CliProject[];
}

const STORE_PATH = join(homedir(), ".laoda.json");

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function load(): CliStore {
  if (!existsSync(STORE_PATH)) {
    return { projects: [] };
  }
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { projects: [] };
  }
}

function save(store: CliStore): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function getProjects(): CliProject[] {
  return load().projects;
}

export function addProject(path: string, name?: string, group?: string): CliProject {
  const store = load();
  const existing = store.projects.find((p) => p.path === path);
  if (existing) return existing;

  const project: CliProject = {
    id: generateId(),
    name: name || path.split("/").pop() || path,
    path,
    group,
  };
  store.projects.push(project);
  save(store);
  return project;
}

export function removeProject(path: string): boolean {
  const store = load();
  const before = store.projects.length;
  store.projects = store.projects.filter((p) => p.path !== path);
  if (store.projects.length < before) {
    save(store);
    return true;
  }
  return false;
}

export function clearProjects(): void {
  save({ projects: [] });
}
