import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Intent } from "./classify.ts";

type IntentBucket = "change" | "add" | "fix" | "remove" | "update" | "other";

type MemoEntry = {
  input: string;
  bucket: IntentBucket;
  tokens: string[];
  intent: Intent;
  createdAt: number;
};

type MemoStore = {
  entries: MemoEntry[];
};

const MEMO_DIR = join(homedir(), ".local", "share", "laoda", "memo");
const MAX_ENTRIES = 200;
const SIMILARITY_THRESHOLD = 0.8;

const BUCKET_KEYWORDS: Record<string, IntentBucket> = {
  change: "change",
  switch: "change",
  use: "change",
  model: "change",
  add: "add",
  create: "add",
  build: "add",
  implement: "add",
  fix: "fix",
  bug: "fix",
  repair: "fix",
  remove: "remove",
  delete: "remove",
  drop: "remove",
  update: "update",
  upgrade: "update",
  modify: "update",
  refactor: "update",
};

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

export function getBucket(tokens: string[]): IntentBucket {
  for (const token of tokens) {
    if (token in BUCKET_KEYWORDS) {
      return BUCKET_KEYWORDS[token]!;
    }
  }
  return "other";
}

export function tokenSimilarity(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const intersection = [...sa].filter((w) => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

export class Memo {
  private readonly memoPath: string;

  constructor(project: string) {
    const dir = project ? join(MEMO_DIR, project) : MEMO_DIR;
    this.memoPath = join(dir, "memo.json");
  }

  private loadStore(): MemoStore {
    if (!existsSync(this.memoPath)) return { entries: [] };
    try {
      return JSON.parse(readFileSync(this.memoPath, "utf-8"));
    } catch {
      return { entries: [] };
    }
  }

  private saveStore(store: MemoStore): void {
    const dir = join(this.memoPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.memoPath, JSON.stringify(store), "utf-8");
  }

  lookup(input: string): Intent | null {
    const tokens = tokenize(input);
    const bucket = getBucket(tokens);
    const store = this.loadStore();

    for (const entry of store.entries) {
      if (entry.bucket !== bucket) continue;
      if (tokenSimilarity(tokens, entry.tokens) >= SIMILARITY_THRESHOLD) {
        return entry.intent;
      }
    }

    return null;
  }

  save(input: string, intent: Intent): void {
    const tokens = tokenize(input);
    const bucket = getBucket(tokens);
    const store = this.loadStore();

    for (const entry of store.entries) {
      if (
        entry.bucket === bucket &&
        tokenSimilarity(tokens, entry.tokens) >= SIMILARITY_THRESHOLD
      ) {
        return;
      }
    }

    const newEntries = [
      ...store.entries,
      { input, bucket, tokens, intent, createdAt: Date.now() },
    ].slice(-MAX_ENTRIES);

    this.saveStore({ entries: newEntries });
  }
}
