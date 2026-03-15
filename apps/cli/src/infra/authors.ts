import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

type WorkType = "my" | "other";

type AuthorEntry = {
  workType: WorkType;
  workerRole?: "designer" | "product";
};

type AuthorMap = Record<string, AuthorEntry>;

const AUTHORS_DIR = join(homedir(), ".local", "share", "laoda");
const AUTHORS_PATH = join(AUTHORS_DIR, "authors.json");

export function loadAuthors(): AuthorMap {
  if (!existsSync(AUTHORS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(AUTHORS_PATH, "utf-8")) as AuthorMap;
  } catch {
    return {};
  }
}

export function saveAuthor(author: string, entry: AuthorEntry): void {
  if (!existsSync(AUTHORS_DIR)) mkdirSync(AUTHORS_DIR, { recursive: true });
  const authors = loadAuthors();
  const updated = { ...authors, [author]: entry };
  writeFileSync(AUTHORS_PATH, JSON.stringify(updated, null, 2), "utf-8");
}

export function getAuthorWorkType(author: string, userName: string): WorkType {
  const authors = loadAuthors();
  if (authors[author]) return authors[author].workType;
  return author === userName ? "my" : "other";
}

export function getAuthorRole(author: string): "designer" | "product" {
  const authors = loadAuthors();
  return authors[author]?.workerRole ?? "designer";
}
