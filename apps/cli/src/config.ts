import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

type LaodaConfig = {
  name?: string;
  openrouterKey?: string;
  model?: string;
  modelsCacheDate?: string;
};

const CONFIG_DIR = join(homedir(), ".local", "share", "laoda");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const MODELS_CACHE_PATH = join(CONFIG_DIR, "models.json");

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): LaodaConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: LaodaConfig): void {
  ensureDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getName(): string | undefined {
  return loadConfig().name;
}

export function setName(name: string): void {
  saveConfig({ ...loadConfig(), name });
}

export function getOpenRouterKey(): string | undefined {
  return loadConfig().openrouterKey;
}

export function setOpenRouterKey(key: string): void {
  saveConfig({ ...loadConfig(), openrouterKey: key });
}

export function getModel(): string {
  return loadConfig().model || "google/gemini-2.0-flash-001";
}

export function setModel(model: string): void {
  saveConfig({ ...loadConfig(), model });
}

export function getModelsCacheDate(): string | undefined {
  return loadConfig().modelsCacheDate;
}

export function saveModelsCache(models: { id: string; name: string }[]): void {
  ensureDir();
  writeFileSync(MODELS_CACHE_PATH, JSON.stringify(models), "utf-8");
  saveConfig({ ...loadConfig(), modelsCacheDate: new Date().toISOString().slice(0, 10) });
}

export function loadModelsCache(): { id: string; name: string }[] {
  if (!existsSync(MODELS_CACHE_PATH)) return [];
  try {
    return JSON.parse(readFileSync(MODELS_CACHE_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function isModelsCacheStale(): boolean {
  const date = getModelsCacheDate();
  if (!date) return true;
  const today = new Date().toISOString().slice(0, 10);
  return date !== today;
}
