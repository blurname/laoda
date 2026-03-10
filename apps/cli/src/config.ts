import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface LaodaConfig {
  name?: string;
}

const CONFIG_DIR = join(homedir(), ".local", "share", "laoda");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

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
  const config = loadConfig();
  config.name = name;
  saveConfig(config);
}
