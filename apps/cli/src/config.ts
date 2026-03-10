import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { LaoConfig, LlmConfig } from "./types.ts";

const CONFIG_PATH = join(homedir(), ".laoda.json");

export function loadConfig(): LaoConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { projects: [] };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { projects: [] };
  }
}

export function saveConfig(config: LaoConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getLlmConfig(): LlmConfig | null {
  const config = loadConfig();
  return config.llm ?? null;
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();

  if (key.startsWith("llm.")) {
    const field = key.slice(4) as keyof LlmConfig;
    if (!config.llm) {
      config.llm = { provider: "openrouter", apiKey: "", model: "" };
    }
    (config.llm as Record<string, string>)[field] = value;
  }

  saveConfig(config);
}

export function getConfigValue(key: string): string | undefined {
  const config = loadConfig();

  if (key.startsWith("llm.")) {
    const field = key.slice(4) as keyof LlmConfig;
    return config.llm?.[field];
  }

  return undefined;
}

export function getBaseUrl(llm: LlmConfig): string {
  if (llm.provider === "openrouter") {
    return "https://openrouter.ai/api/v1";
  }
  return llm.baseUrl || "";
}
