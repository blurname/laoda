import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_DIR = join(homedir(), ".local", "share", "laoda", "logs");

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `${date}.log`);
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function log(level: string, message: string): void {
  ensureLogDir();
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  appendFileSync(getLogPath(), line, "utf-8");
}

export function logUserInput(input: string): void {
  log("INPUT", input);
}

export function logLlmRequest(model: string, messages: unknown): void {
  log("LLM_REQ", `model=${model} messages=${JSON.stringify(messages)}`);
}

export function logLlmResponse(raw: string): void {
  log("LLM_RES", raw);
}

export function logIntent(intent: unknown): void {
  log("INTENT", JSON.stringify(intent));
}

export function logAction(action: string): void {
  log("ACTION", action);
}

export function logError(error: string): void {
  log("ERROR", error);
}
