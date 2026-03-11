import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Intent } from "./llm.ts";

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

const MEMO_PATH = join(homedir(), ".local", "share", "laoda", "memo.json");
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

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function getBucket(tokens: string[]): IntentBucket {
  for (const token of tokens) {
    if (token in BUCKET_KEYWORDS) {
      return BUCKET_KEYWORDS[token]!;
    }
  }
  return "other";
}

function tokenSimilarity(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const intersection = [...sa].filter((w) => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

function loadStore(): MemoStore {
  if (!existsSync(MEMO_PATH)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(MEMO_PATH, "utf-8"));
  } catch {
    return { entries: [] };
  }
}

function saveStore(store: MemoStore): void {
  writeFileSync(MEMO_PATH, JSON.stringify(store), "utf-8");
}

export function memoLookup(input: string): Intent | null {
  const tokens = tokenize(input);
  const bucket = getBucket(tokens);
  const store = loadStore();

  for (const entry of store.entries) {
    if (entry.bucket !== bucket) continue;
    if (tokenSimilarity(tokens, entry.tokens) >= SIMILARITY_THRESHOLD) {
      return entry.intent;
    }
  }

  return null;
}

export function memoSave(input: string, intent: Intent): void {
  const tokens = tokenize(input);
  const bucket = getBucket(tokens);
  const store = loadStore();

  // Don't store duplicates
  for (const entry of store.entries) {
    if (entry.bucket === bucket && tokenSimilarity(tokens, entry.tokens) >= SIMILARITY_THRESHOLD) {
      return;
    }
  }

  store.entries.push({
    input,
    bucket,
    tokens,
    intent,
    createdAt: Date.now(),
  });

  // Evict oldest if over limit
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(-MAX_ENTRIES);
  }

  saveStore(store);
}
