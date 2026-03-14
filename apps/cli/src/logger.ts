import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const BASE_LOG_DIR = join(homedir(), ".local", "share", "laoda", "logs");

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export class Logger {
  private readonly logDir: string;

  constructor(project: string) {
    this.logDir = project ? join(BASE_LOG_DIR, project) : BASE_LOG_DIR;
  }

  private ensureDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getPath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return join(this.logDir, `${date}.log`);
  }

  log(level: string, message: string): void {
    this.ensureDir();
    const line = `[${timestamp()}] [${level}] ${message}\n`;
    appendFileSync(this.getPath(), line, "utf-8");
  }

  logUserInput(input: string): void {
    this.log("INPUT", input);
  }

  logLlmRequest(model: string, messages: unknown): void {
    this.log("LLM_REQ", `model=${model} messages=${JSON.stringify(messages)}`);
  }

  logLlmResponse(raw: string): void {
    this.log("LLM_RES", raw);
  }

  logIntent(intent: unknown): void {
    this.log("INTENT", JSON.stringify(intent));
  }

  logAction(action: string): void {
    this.log("ACTION", action);
  }

  logError(error: string): void {
    this.log("ERROR", error);
  }
}
