import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const BASE_LOG_DIR = join(homedir(), ".local", "share", "laoda", "logs");

function getLogDir(project: string): string {
  return project ? join(BASE_LOG_DIR, project) : BASE_LOG_DIR;
}

function ensureLogDir(project: string): void {
  const dir = getLogDir(project);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getLogPath(project: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(getLogDir(project), `${date}.log`);
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export type Logger = {
  log: (level: string, message: string) => void;
  logUserInput: (input: string) => void;
  logLlmRequest: (model: string, messages: unknown) => void;
  logLlmResponse: (raw: string) => void;
  logIntent: (intent: unknown) => void;
  logAction: (action: string) => void;
  logError: (error: string) => void;
};

export function createLogger(project: string): Logger {
  function log(level: string, message: string): void {
    ensureLogDir(project);
    const line = `[${timestamp()}] [${level}] ${message}\n`;
    appendFileSync(getLogPath(project), line, "utf-8");
  }

  return {
    log,
    logUserInput: (input: string) => log("INPUT", input),
    logLlmRequest: (model: string, messages: unknown) =>
      log("LLM_REQ", `model=${model} messages=${JSON.stringify(messages)}`),
    logLlmResponse: (raw: string) => log("LLM_RES", raw),
    logIntent: (intent: unknown) => log("INTENT", JSON.stringify(intent)),
    logAction: (action: string) => log("ACTION", action),
    logError: (error: string) => log("ERROR", error),
  };
}
